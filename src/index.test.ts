import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NOTATION_ETAG } from './generated/notation.ts';
import worker from './index.ts';

const env = { DISCORD_PUBLIC_KEY: '0'.repeat(64) };

/** The Worker's fetch handler is a plain function, so it can be called with a
 *  standard Request — no wrangler, no network. */
function fetchWorker(init?: RequestInit, url = 'https://example.workers.dev/') {
  return worker.fetch(new Request(url, init) as never, env as never);
}

describe('GET — the notation page', () => {
  it('serves HTML', async () => {
    const response = await fetchWorker();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await response.text(), /^<!doctype html>/);
  });

  it('sends an ETag and revalidates rather than caching stale', async () => {
    const response = await fetchWorker();
    assert.equal(response.headers.get('etag'), NOTATION_ETAG);
    assert.match(response.headers.get('cache-control') ?? '', /must-revalidate/);
  });

  it('answers 304 when the client already has this version', async () => {
    const response = await fetchWorker({ headers: { 'if-none-match': NOTATION_ETAG } });
    assert.equal(response.status, 304);
    assert.equal(await response.text(), '');
  });

  it('sends the body when the client holds an older version', async () => {
    const response = await fetchWorker({ headers: { 'if-none-match': '"stale00000000000"' } });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 1000);
  });
});

describe('POST — the interactions endpoint', () => {
  it('rejects a request with no signature headers', async () => {
    const response = await fetchWorker({ method: 'POST', body: '{"type":1}' });
    assert.equal(response.status, 401);
  });

  it('rejects a bad signature rather than throwing', async () => {
    // A 401 proves verification ran and returned false; a 500 would mean it
    // threw. That distinction is what diagnosed the failed first deploy.
    const response = await fetchWorker({
      method: 'POST',
      body: '{"type":1}',
      headers: {
        'x-signature-ed25519': 'a'.repeat(128),
        'x-signature-timestamp': '1700000000',
      },
    });
    assert.equal(response.status, 401);
  });
});

describe('other methods', () => {
  it('are not allowed', async () => {
    assert.equal((await fetchWorker({ method: 'DELETE' })).status, 405);
  });
});
