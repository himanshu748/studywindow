import { chromium, type Browser, type Page } from 'playwright-core';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from './config.js';
import { Budget, BROWSER_RESERVATION } from './budget.js';
import { ORIGIN, courseUrl, validateCatalogueUrl } from './urls.js';
import { BrowserNavigationError, StudyError, checkCancelled } from './errors.js';
import { RawCourse } from './extract.js';
import { createPricingGuard } from './pricing.js';
import { Receipt, type ReceiptData } from './schemas.js';
const API = 'https://api.browser.tinyfish.ai';
const Session = z.object({
  session_id: z
    .string()
    .regex(/^(?:br|tf)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  cdp_url: z.string(),
});
export function allowedBrowserRequest(
  url: string,
  method: string,
  document: boolean,
  body: string | null = null,
): boolean {
  try {
    const u = new URL(url);
    if (u.origin !== ORIGIN || u.username || u.password || u.hash) return false;
    if (method === 'POST') {
      const id = /^\/api\/course-status\/([1-9][0-9]{0,7})$/.exec(u.pathname)?.[1];
      if (
        document ||
        !id ||
        [...u.searchParams.keys()].some((k) => k !== '_wrapper_format') ||
        !['drupal_ajax', null].includes(u.searchParams.get('_wrapper_format'))
      )
        return false;
      const form = new URLSearchParams(body ?? '');
      if (
        (body?.length ?? 0) > 20000 ||
        form.getAll('nodeId').length !== 1 ||
        form.get('nodeId') !== id
      )
        return false;
      const keys = new Set([
        'nodeId',
        '_drupal_ajax',
        'ajax_page_state[theme]',
        'ajax_page_state[theme_token]',
        'ajax_page_state[libraries]',
      ]);
      return (
        [...form.keys()].every((k) => keys.has(k)) &&
        [...new Set(form.keys())].every((k) => form.getAll(k).length === 1)
      );
    }
    if (!['GET', 'HEAD'].includes(method)) return false;
    if (document) {
      if (u.pathname === '/course-search') {
        validateCatalogueUrl(url);
        return true;
      }
      return courseUrl(url) === url;
    }
    return true;
  } catch {
    return false;
  }
}
export function validateCdpUrl(value: string): string {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new StudyError('PROVIDER_FAILURE', 'TinyFish returned an invalid browser connection.');
  }
  if (
    u.protocol !== 'wss:' ||
    u.username ||
    u.password ||
    u.hash ||
    !(u.hostname.endsWith('.tinyfish.io') || u.hostname.endsWith('.tinyfish.ai'))
  )
    throw new StudyError(
      'PROVIDER_FAILURE',
      'TinyFish returned an unsupported browser connection host.',
    );
  return u.href;
}
/** Isolated read-only browser. Only the site’s verified read-only status POST is allowed alongside GET/HEAD. */
export async function expandCourseWithBrowser(
  config: Config,
  budget: Budget,
  url: string,
  panels: string[],
  signal?: AbortSignal,
  pricingGuard?: ReturnType<typeof createPricingGuard>,
): Promise<{ data: unknown; receipt: ReceiptData }> {
  courseUrl(url);
  checkCancelled(signal);
  await (pricingGuard ?? createPricingGuard(config.key)).ensure('browser', signal);
  const reservation = await budget.reserve('browser');
  const started = Date.now();
  let stage = 'create_session';
  let sessionId: string | undefined,
    browser: Browser | undefined,
    keepAlive: ReturnType<typeof setInterval> | undefined;
  const duration = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(120000)]);
  const abort = () => {
    if (keepAlive) clearInterval(keepAlive);
    void browser?.close().catch(() => undefined);
  };
  duration.addEventListener('abort', abort, { once: true });
  try {
    let response: Response;
    try {
      response = await fetch(API, {
        method: 'POST',
        headers: { 'X-API-Key': config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout_seconds: 30, proxy_config: { enabled: false } }),
        signal: AbortSignal.any([duration, AbortSignal.timeout(60000)]),
        redirect: 'error',
      });
    } catch {
      checkCancelled(signal);
      throw new StudyError(
        'PROVIDER_TIMEOUT',
        'TinyFish Browser did not start within its bounded timeout. No new session was retried.',
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status))
        throw new StudyError('AUTHENTICATION', 'TinyFish Browser rejected authentication.');
      if ([402, 429].includes(response.status))
        throw new StudyError(
          'PROVIDER_QUOTA',
          'TinyFish Browser quota or wallet prevented this session.',
        );
      throw new StudyError(
        'PROVIDER_FAILURE',
        `TinyFish Browser returned HTTP ${response.status}; no raw provider body was exposed.`,
      );
    }
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 10000)
      throw new StudyError(
        'RESPONSE_TOO_LARGE',
        'The Browser session envelope exceeded its limit.',
      );
    const raw = await readSessionBody(response);
    const session = Session.safeParse(JSON.parse(raw));
    if (!session.success)
      throw new StudyError('PROVIDER_FAILURE', 'TinyFish Browser session contract changed.');
    sessionId = session.data.session_id;
    await budget.started(reservation, sessionId);
    const cdp = validateCdpUrl(session.data.cdp_url);
    stage = 'connect_cdp';
    browser = await chromium.connectOverCDP(cdp, { timeout: 25000 });
    checkCancelled(duration);
    stage = 'isolated_context';
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    stage = 'install_network_guards';
    await context.routeWebSocket('**/*', (socket) =>
      socket.close({ code: 1008, reason: 'Read-only source adapter' }),
    );
    await context.route('**/*', async (route) => {
      const req = route.request();
      if (
        !allowedBrowserRequest(req.url(), req.method(), req.isNavigationRequest(), req.postData())
      )
        await route.abort('blockedbyclient');
      else await route.continue();
    });
    const page = context.pages()[0] ?? (await context.newPage());
    page.on('download', (download) => {
      void download.cancel();
    });
    page.setDefaultTimeout(10000);
    keepAlive = setInterval(() => {
      void page.title().catch(() => undefined);
    }, 5000);
    stage = 'navigate_course';
    const navigation = await navigatePublicCourse(page, url, duration);
    if (navigation && [401, 403, 429].includes(navigation.status()))
      throw new StudyError(
        'SITE_BLOCKED',
        'Cambridge refused the public Browser navigation. No workaround was attempted.',
      );
    if (navigation?.status() === 404)
      throw new StudyError('NOT_FOUND', 'The course page was not found.');
    if (courseUrl(page.url()) !== url)
      throw new StudyError(
        'SITE_CHANGED',
        'The Browser course navigation redirected unexpectedly.',
      );
    if (navigation && navigation.status() >= 500)
      throw new StudyError(
        'PROVIDER_FAILURE',
        'The public source returned a server error. No substitute data was returned.',
      );
    stage = 'validate_course';
    const deny = page.getByRole('button', { name: 'Deny', exact: true });
    if (await deny.isVisible()) await deny.click();
    await page.locator('main h1').waitFor({ state: 'visible' });
    const dateItems = page.locator('.accordion--course-instances .accordion-item');
    const count = await dateItems.count();
    if (count < 1 || count > 3)
      throw new StudyError('SITE_CHANGED', 'The supported Course Dates structure changed.');
    stage = 'expand_dates';
    for (let i = 0; i < count; i++) {
      checkCancelled(duration);
      const item = dateItems.nth(i),
        button = item.locator('.accordion-item__button');
      if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
      await item.locator('.course-details').waitFor({ state: 'visible' });
    }
    for (let i = 0; i < count; i++) {
      const item = dateItems.nth(i);
      if (
        (await item.locator('.course-status').count()) === 0 &&
        (await item.locator('.course-instance-status,.component-course-status').count()) > 0
      ) {
        try {
          await item.locator('.course-status').waitFor({ state: 'attached', timeout: 8000 });
        } catch {
          /* Missing availability remains explicit unknown; never inferred from future dates. */
        }
      }
    }
    stage = 'expand_information';
    for (const name of panels) {
      checkCancelled(duration);
      const button = page.getByRole('button', { name, exact: true });
      if ((await button.count()) !== 1)
        throw new StudyError('SITE_CHANGED', 'An expected course information control changed.');
      if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
      await button.locator('..').locator('.accordion-item__content').waitFor({ state: 'visible' });
    }
    stage = 'read_dom';
    const data = await page.locator('main').evaluate((main, panelNames) => {
      const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if ((main.textContent?.length ?? 0) > 250000)
        throw new Error('Source content exceeded supported size');
      const offerings = Array.from(
        main.querySelectorAll('.accordion--course-instances .accordion-item'),
      ).map((item) => ({
        date_label: text(item.querySelector('.accordion-item__button')),
        status: text(item.querySelector('.course-status')),
        fields: Array.from(item.querySelectorAll('.course-details__item')).map((el) => {
          const label = el.querySelector('.course-details__item-label');
          const copy = el.cloneNode(true) as Element;
          copy.querySelector('.course-details__item-label')?.remove();
          return { label: text(label), value: text(copy) };
        }),
      }));
      const panels = Array.from(main.querySelectorAll('.accordion-item'))
        .filter((item) => panelNames.includes(text(item.querySelector('.accordion-item__button'))))
        .map((item) => ({
          label: text(item.querySelector('.accordion-item__button')),
          text: text(item.querySelector('.accordion-item__content')),
        }));
      return {
        page_url: location.href,
        title: text(main.querySelector('h1')),
        blocked: false,
        offerings,
        panels,
        dates_found: offerings.length,
        all_details_loaded:
          offerings.every((o) => o.fields.length >= 3) && panels.length === panelNames.length,
      };
    }, panels);
    const parsed = RawCourse.safeParse(data);
    if (!parsed.success)
      throw new StudyError(
        'SITE_CHANGED',
        'The expanded source DOM no longer matches the supported course contract.',
      );
    const seconds = (Date.now() - started) / 1000;
    const receipt = Receipt.parse({
      id: randomUUID(),
      endpoint: 'browser',
      source_url: url,
      checked_at: new Date().toISOString(),
      sha256: createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'),
      run_id: null,
      session_id: sessionId,
      steps: null,
      reserved_usd: BROWSER_RESERVATION,
      estimated_usd: Math.ceil((seconds / 60) * 0.002 * 1000000) / 1000000,
      fresh: true,
    });
    await mkdir(join(config.stateDir, 'receipts'), { recursive: true, mode: 0o700 });
    await writeFile(
      join(config.stateDir, 'receipts', receipt.id + '.json'),
      JSON.stringify(receipt, null, 2),
      { mode: 0o600 },
    );
    return { data: parsed.data, receipt };
  } catch (error) {
    const safeMessage = String(error instanceof Error ? error.message : 'Unknown browser failure')
      .split('\n')[0]!
      .replace(/(?:https?|wss?):\/\/[^\s)]+/g, '[url redacted]')
      .replace(/(?:sk|api)[_-][A-Za-z0-9_-]{16,}/g, '[credential redacted]')
      .slice(0, 240);
    try {
      await mkdir(join(config.stateDir, 'diagnostics'), { recursive: true, mode: 0o700 });
      await writeFile(
        join(config.stateDir, 'diagnostics', reservation + '.json'),
        JSON.stringify({
          stage,
          error_name: error instanceof Error ? error.name : 'Unknown',
          message: safeMessage,
          session_id: sessionId ?? null,
          source_url: url,
        }),
        { mode: 0o600 },
      );
    } catch {}
    if (signal?.aborted)
      throw new StudyError(
        'CANCELLED',
        'Browser work was cancelled; session termination was attempted.',
      );
    if (duration.aborted)
      throw new StudyError(
        'PROVIDER_TIMEOUT',
        'Browser work exceeded the 120-second bound. Session termination was attempted.',
      );
    if (error instanceof StudyError) throw error;
    if (stage === 'navigate_course' && error instanceof ExhaustedCourseNavigation)
      throw new BrowserNavigationError({
        stage: 'navigate_course',
        source_url: url,
        network_code: error.networkCode,
        checked_at: new Date().toISOString(),
        session_id: sessionId ?? null,
        attempts: 3,
      });
    if (['validate_course', 'expand_dates', 'expand_information', 'read_dom'].includes(stage)) {
      throw new StudyError(
        'SITE_CHANGED',
        'The required course structure could not be validated after loading. No fields were guessed.',
      );
    }
    throw new StudyError(
      'PROVIDER_FAILURE',
      'The isolated Browser could not complete the public course interaction. No Agent retry or saved-data fallback was made.',
    );
  } finally {
    duration.removeEventListener('abort', abort);
    if (keepAlive) clearInterval(keepAlive);
    try {
      await Promise.race([
        browser?.close(),
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 5000);
          timer.unref();
        }),
      ]);
    } catch {
      /* The idle timeout is a second termination guard. */
    }
    if (sessionId) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(`${API}/${sessionId}`, {
            method: 'DELETE',
            headers: { 'X-API-Key': config.key },
            signal: AbortSignal.timeout(10000),
            redirect: 'error',
          });
          if (r.status === 204 || r.status === 404) break;
          if (![409, 429, 500, 503, 504].includes(r.status)) break;
          await r.body?.cancel();
        } catch {
          /* No new session is created. */
        }
      }
    }
    await budget.browserFinish(reservation, (Date.now() - started) / 1000);
  }
}

export async function readSessionBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new StudyError('PROVIDER_FAILURE', 'The Browser session envelope was empty.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 10000) {
      await reader.cancel();
      throw new StudyError(
        'RESPONSE_TOO_LARGE',
        'The Browser session envelope exceeded its 10 KB limit.',
      );
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function transientNavigationCode(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  const codes = [...error.message.matchAll(/net::(ERR_[A-Z_]+)\b/g)].map((match) => match[1]);
  if (codes.length !== 1) return undefined;
  const code = codes[0];
  if (
    code === 'ERR_EMPTY_RESPONSE' ||
    code === 'ERR_CONNECTION_CLOSED' ||
    code === 'ERR_CONNECTION_RESET' ||
    code === 'ERR_NETWORK_CHANGED'
  )
    return code;
  return undefined;
}
class ExhaustedCourseNavigation extends Error {
  constructor(readonly networkCode: NonNullable<ReturnType<typeof transientNavigationCode>>) {
    super(`Public course navigation exhausted three same-session attempts: net::${networkCode}.`);
  }
}
/** Retry only transient, read-only document navigation within the SAME allocated session. */
export async function navigatePublicCourse(
  page: Pick<Page, 'goto'>,
  url: string,
  signal?: AbortSignal,
) {
  courseUrl(url);
  for (let attempt = 0; attempt < 3; attempt++) {
    checkCancelled(signal);
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (error) {
      checkCancelled(signal);
      const networkCode = transientNavigationCode(error);
      if (!networkCode) throw error;
      if (attempt === 2) throw new ExhaustedCourseNavigation(networkCode);
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          reject(new StudyError('CANCELLED', 'Source navigation was cancelled.'));
        };
        const timer = setTimeout(
          () => {
            signal?.removeEventListener('abort', abort);
            resolve();
          },
          750 * 2 ** attempt + Math.floor(Math.random() * 250),
        );
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
  }
  throw new StudyError('PROVIDER_FAILURE', 'Public course navigation did not complete.');
}
