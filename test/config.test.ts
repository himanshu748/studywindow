// Offline configuration tests use only supplied synthetic environments and temporary files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { TinyFish } from '../src/provider.js';

test('Fetch tier stays absent by default and accepts only explicit supported operator values', () => {
  const omitted = loadConfig({});
  assert.equal(omitted.fetchTier, undefined);
  assert.equal(Object.hasOwn(omitted, 'fetchTier'), false);
  for (const tier of ['hobby', 'builder'])
    assert.equal(loadConfig({ STUDYWINDOW_FETCH_TIER: tier }).fetchTier, tier);
  for (const tier of ['', 'Hobby', 'Builder', 'free', 'auto', ' hobby ', 'hobby,builder'])
    assert.throws(
      () => loadConfig({ STUDYWINDOW_FETCH_TIER: tier }),
      (error: unknown) => (error as { code: string }).code === 'INVALID_INPUT',
    );
});

test('env-file Fetch tier follows existing environment precedence and fails closed when invalid', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'studywindow-config-offline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'synthetic.env');
  await writeFile(
    file,
    'TINYFISH_API_KEY=offline-config-placeholder\nSTUDYWINDOW_LIVE=1\nSTUDYWINDOW_FETCH_TIER=hobby\n',
  );
  const fromFile = loadConfig({ STUDYWINDOW_ENV_FILE: file });
  assert.equal(fromFile.fetchTier, 'hobby');
  assert.equal(fromFile.live, true);
  assert.equal(fromFile.key, 'offline-config-placeholder');
  assert.equal(
    loadConfig({ STUDYWINDOW_ENV_FILE: file, STUDYWINDOW_FETCH_TIER: 'builder' }).fetchTier,
    'builder',
  );
  assert.throws(
    () => loadConfig({ STUDYWINDOW_ENV_FILE: file, STUDYWINDOW_FETCH_TIER: 'auto' }),
    (error: unknown) => (error as { code: string }).code === 'INVALID_INPUT',
  );
  await writeFile(file, 'STUDYWINDOW_FETCH_TIER=auto\n');
  assert.throws(
    () => loadConfig({ STUDYWINDOW_ENV_FILE: file }),
    (error: unknown) => (error as { code: string }).code === 'INVALID_INPUT',
  );
});

test('TinyFish applies explicit Fetch tier configuration before dispatching any content request', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'studywindow-tier-wiring-offline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const target = 'https://www.pace.cam.ac.uk/courses/offline-tier-wiring';
  for (const tier of [undefined, 'hobby', 'builder']) {
    let walletCalls = 0,
      contentCalls = 0;
    const config = loadConfig({
      TINYFISH_API_KEY: 'offline-config-placeholder',
      STUDYWINDOW_LIVE: '1',
      STUDYWINDOW_STATE_DIR: join(dir, tier ?? 'unspecified'),
      ...(tier === undefined ? {} : { STUDYWINDOW_FETCH_TIER: tier }),
    });
    const provider = new TinyFish(config, async (input) => {
      if (input === 'https://agent.tinyfish.ai/v1/wallet') {
        walletCalls++;
        return new Response(
          JSON.stringify({
            available_balance: '1',
            currency: 'USD',
            rates: {
              as_of: '2026-11-11T12:00:00Z',
              meters: [
                { label: 'TinyFish Fetch (Hobby)', unit_amount: '0', currency: 'USD', per: 'url' },
                {
                  label: 'TinyFish Fetch (Builder)',
                  unit_amount: '0.001',
                  currency: 'USD',
                  per: 'url',
                },
              ],
            },
          }),
        );
      }
      assert.equal(input, 'https://api.fetch.tinyfish.ai');
      contentCalls++;
      return new Response(
        JSON.stringify({
          results: [
            {
              url: target,
              final_url: target,
              text: `<main>${'Synthetic offline response. '.repeat(8)}</main>`,
            },
          ],
          errors: [],
        }),
      );
    });
    if (tier === 'hobby') {
      assert.equal((await provider.fetchHtml(target)).receipt.endpoint, 'fetch');
      assert.equal(contentCalls, 1);
    } else {
      await assert.rejects(
        provider.fetchHtml(target),
        (error: unknown) =>
          (error as { code: string }).code ===
          (tier === 'builder' ? 'PRICING_CHANGED' : 'PROVIDER_FAILURE'),
      );
      assert.equal(contentCalls, 0);
    }
    assert.equal(walletCalls, 1);
  }
});
