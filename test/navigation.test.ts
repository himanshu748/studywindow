// Offline network-recovery tests: no browser or provider is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { type Page, type Response as PageResponse } from 'playwright-core';
import { navigatePublicCourse } from '../src/browser.js';
const url = 'https://www.pace.cam.ac.uk/courses/offline-navigation';
const response = { status: () => 200 } as PageResponse;
function page(goto: (url: string, options: unknown) => Promise<PageResponse | null>) {
  return { goto } as Pick<Page, 'goto'>;
}
test('transient document GET errors retry at most twice in the same caller session', async () => {
  let calls = 0;
  const result = await navigatePublicCourse(
    page(async (target, options) => {
      calls++;
      assert.equal(target, url);
      assert.deepEqual(options, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (calls < 3) throw new Error('page.goto: net::ERR_EMPTY_RESPONSE');
      return response;
    }),
    url,
  );
  assert.equal(result, response);
  assert.equal(calls, 3);
  let failedCalls = 0;
  await assert.rejects(
    navigatePublicCourse(
      page(async () => {
        failedCalls++;
        throw new Error('net::ERR_CONNECTION_CLOSED');
      }),
      url,
    ),
    /ERR_CONNECTION_CLOSED/,
  );
  assert.equal(failedCalls, 3);
});
test('HTTP access refusal, TLS errors and unsupported URLs never trigger navigation retries', async () => {
  let calls = 0;
  const denied = { status: () => 403 } as PageResponse;
  assert.equal(
    await navigatePublicCourse(
      page(async () => {
        calls++;
        return denied;
      }),
      url,
    ),
    denied,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    navigatePublicCourse(
      page(async () => {
        calls++;
        throw new Error('net::ERR_CERT_AUTHORITY_INVALID');
      }),
      url,
    ),
    /ERR_CERT_AUTHORITY_INVALID/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    navigatePublicCourse(
      page(async () => {
        calls++;
        return response;
      }),
      'http://127.0.0.1/private',
    ),
  );
  assert.equal(calls, 0);
});
test('cancellation during retry backoff prevents another document request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const result = navigatePublicCourse(
    page(async () => {
      calls++;
      setTimeout(() => controller.abort(), 0);
      throw new Error('net::ERR_CONNECTION_RESET');
    }),
    url,
    controller.signal,
  );
  await assert.rejects(result, (e: unknown) => (e as { code: string }).code === 'CANCELLED');
  assert.equal(calls, 1);
});
