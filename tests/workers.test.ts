
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import worker from '../deploy/homepage-worker/worker.ts';
import redirect from '../deploy/news-redirect/worker.ts';

class MemoryCache {
  entries = new Map<string, Response>();
  async match(request: RequestInfo | URL) {
    const key = request instanceof Request ? request.url : String(request);
    const hit = this.entries.get(key);
    return hit ? hit.clone() : undefined;
  }
  async put(request: RequestInfo | URL, response: Response) {
    const key = request instanceof Request ? request.url : String(request);
    this.entries.set(key, await response.clone().arrayBuffer().then(body =>
      new Response(body, response)));
  }
}
function installEdgeCache() {
  const cache = new MemoryCache();
  Object.defineProperty(globalThis, 'caches', { value: { default: cache }, configurable: true });
  return cache;
}
installEdgeCache();
beforeEach(() => { installEdgeCache(); });

type ElementHandler = { element(element: ElementLike): void };
type ElementLike = {
  prepend(html: string): void;
  getAttribute(name: string): string | undefined;
  setAttribute(name: string, value: string): void;
  remove(): void;
};
type RewriteHandler = [string, ElementHandler];
const env = { PUBLIC_HOST: 'example.org', PAGES_ORIGIN: 'https://pages.example.org/' };
const request = (path = '/', host = 'example.org') => new Request(`https://${host}${path}`);
// Exercise the worker's HTMLRewriter callbacks against a parsed document.
class Rewriter {
  handlers: RewriteHandler[] = [];
  on(selector: string, handler: ElementHandler) {
    this.handlers.push([selector, handler]);
    return this;
  }
  async transform(response: Response) {
    const $ = load(await response.text());
    for (const [selector, handler] of this.handlers)
      $(selector).each((_, node) =>
        handler.element({
          prepend: (html) => $(node).prepend(html),
          getAttribute: (name) => $(node).attr(name),
          setAttribute: (name, value) => $(node).attr(name, value),
          remove: () => $(node).remove(),
        }),
      );
    return new Response($.html(), response);
  }
}
test('redirect preserves query parameters and disables caching', async () => {
  const result = redirect.fetch(request('/any/path?utm_source=test'));
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), 'https://stringerjournalism.org/?utm_source=test');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(await result.text(), '');
});
test('preview forwards legacy requests to public origin', async (t) => {
  t.mock.method(globalThis, 'fetch', async (outgoing: RequestInfo | URL) => {
    assert.ok(outgoing instanceof Request);
    assert.equal(outgoing.url, 'https://example.org/mission?x=1');
    return new Response('legacy');
  });
  assert.equal(
    await (await worker.fetch(request('/mission?x=1', 'preview.example.org'), env)).text(),
    'legacy',
  );
});
test('worker reports missing assets, bad origins and invalid upstream responses', async (t) => {
  assert.equal((await worker.fetch(request('/news-assets/private.csv'), env)).status, 404);
  assert.equal(
    (await worker.fetch(request(), { ...env, PAGES_ORIGIN: 'http://pages.example.org' })).status,
    503,
  );
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('bad', { status: 503 }));
  assert.equal((await worker.fetch(request(), env)).status, 502);
  for (const headers of [{}, { 'content-type': 'application/json' }]) {
    mock.mock.mockImplementation(async () => new Response('{}', { headers }));
    assert.equal((await worker.fetch(request(), env)).status, 502);
  }
});
test('homepage rewrites relative navigation and indexing only on the configured public host', async (t) => {
  (globalThis as typeof globalThis & { HTMLRewriter: typeof Rewriter }).HTMLRewriter = Rewriter;
  t.after(() => {
    delete (globalThis as typeof globalThis & { HTMLRewriter?: typeof Rewriter }).HTMLRewriter;
  });
  t.mock.method(
    globalThis,
    'fetch',
    async (url: URL) => {
      const relative = url.pathname === '/news/' ? './' : '../';
      return new Response(
        `<html><head><meta name="robots" content="noindex"><link rel="stylesheet" href="${relative}style.css?v=1"></head><body><a href="${relative}">Home</a><a href="#stories">Stories</a><a href="https://outside.org">Outside</a><nav class="edition-switcher"><a href="${relative}" hreflang="en">English</a><a href="${relative}br/" hreflang="pt-BR">Brazil</a><a href="${relative}pt/" hreflang="pt-PT">Portugal</a><a href="" hreflang="fr">French</a></nav></body></html>`,
        {
          headers: {
            'content-type': 'text/html',
            etag: 'x',
            'content-length': '1',
            'content-encoding': 'gzip',
            'set-cookie': 'private=1',
            link: 'private',
            'x-robots-tag': 'noindex',
          },
        },
      );
    },
  );
  for (const [host, path, indexing, publicIndex] of [
    ['example.org', '/', 'true', true],
    ['example.org', '/br/', 'true', true],
    ['preview.example.org', '/pt/', 'true', false],
    ['example.org', '/', 'false', false],
  ] as const) {
    const response = await worker.fetch(request(`${path}?campaign=test`, host), {
      ...env,
      PAGES_ORIGIN: 'https://pages.example.org/news/',
      PUBLIC_INDEXING: indexing,
    });
    const $ = load(await response.text());
    const base = new URL($('base').attr('href') ?? '', `https://${host}${path}`);
    assert.equal(base.pathname, `/news-assets${path}`);
    assert.equal(new URL($('link[rel="stylesheet"]').attr('href') ?? '', base).href, `https://${host}/news-assets/style.css?v=1`);
    assert.equal($('a').eq(1).attr('href'), `${path}?campaign=test#stories`);
    assert.equal($('a').eq(2).attr('href'), 'https://outside.org');
    assert.equal($('[hreflang="en"]').attr('href'), '/?campaign=test&edition=en-US');
    assert.equal($('[hreflang="pt-BR"]').attr('href'), '/br/?campaign=test&edition=pt-BR');
    assert.equal($('[hreflang="pt-PT"]').attr('href'), '/pt/?campaign=test&edition=pt-PT');
    assert.equal($('[hreflang="fr"]').attr('href'), '');
    assert.equal($('meta[name="robots"]').length, publicIndex ? 0 : 1);
    assert.equal(response.headers.has('x-robots-tag'), !publicIndex);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
    for (const name of ['etag', 'content-length', 'content-encoding', 'set-cookie', 'link'])
      assert.equal(response.headers.get(name), null);
  }

  const selected = await worker.fetch(new Request('https://example.org/?edition=en-US', {
    headers: { Cookie: 'stringer_edition=pt-PT', 'Accept-Language': 'fr' },
  }), env);
  assert.equal(selected.status, 200);
  assert.equal(selected.headers.get('cache-control'), 'no-store');
  assert.equal(selected.headers.get('set-cookie'), 'stringer_edition=en-US; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax');
  const brazil = await worker.fetch(request('/br/?edition=pt-BR'), env);
  assert.match(brazil.headers.get('set-cookie') ?? '', /^stringer_edition=pt-BR;/);
});
test('CDN snapshot and modules get short shared cache headers without immutable', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{"schemaVersion":2}', {
    headers: { 'content-type': 'application/json', 'cache-control': 'private' },
  }));
  const snapshot = await worker.fetch(request('/news-assets/data/news.json'), env);
  assert.equal(snapshot.headers.get('cache-control'), 'public, max-age=60, s-maxage=300');
  assert.equal(snapshot.headers.get('x-worker-cache'), 'MISS');
  mock.mock.mockImplementation(async () => new Response('export {}', {
    headers: { 'content-type': 'application/javascript' },
  }));
  const module = await worker.fetch(request('/news-assets/app.js?v=0123456789abcdef'), env);
  assert.equal(module.headers.get('cache-control'), 'public, max-age=60, s-maxage=300');
  assert.equal(module.headers.get('cache-control')?.includes('immutable'), false);
  const image = await worker.fetch(request('/news-assets/assets/stringer-logo.png'), env);
  assert.equal(image.headers.get('cache-control'), 'public, max-age=86400');
});
test('Worker edge cache hits repeat homepage and asset GETs while edition redirects stay uncached', async (t) => {
  (globalThis as typeof globalThis & { HTMLRewriter: typeof Rewriter }).HTMLRewriter = Rewriter;
  t.after(() => {
    delete (globalThis as typeof globalThis & { HTMLRewriter?: typeof Rewriter }).HTMLRewriter;
  });
  let upstream = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    upstream++;
    return new Response('<html><head></head><body><a href="./">Home</a></body></html>', {
      headers: { 'content-type': 'text/html' },
    });
  });
  const first = await worker.fetch(request('/pt/'), env);
  assert.equal(first.headers.get('x-worker-cache'), 'MISS');
  assert.equal(upstream, 1);
  const firstBody = await first.text();
  const second = await worker.fetch(request('/pt/'), env);
  assert.equal(second.headers.get('x-worker-cache'), 'HIT');
  assert.equal(upstream, 1);
  assert.equal(await second.text(), firstBody);
  const campaign = await worker.fetch(request('/pt/?utm=another'), env);
  assert.equal(campaign.headers.get('x-worker-cache'), 'MISS');
  assert.equal(upstream, 2);
  const redirected = await worker.fetch(new Request('https://example.org/', {
    headers: { 'Accept-Language': 'pt-PT' },
  }), env);
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.get('cache-control'), 'no-store');
  assert.equal(redirected.headers.get('x-worker-cache'), null);
});

test('asset requests survive an unavailable edge cache and HEAD skips cache writes', async t => {
  Object.defineProperty(globalThis, 'caches', { value: {}, configurable: true });
  t.mock.method(globalThis, 'fetch', async () => new Response(null));
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request('https://example.org/news-assets/style.css', {method}), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-worker-cache'), 'MISS');
  }
});
