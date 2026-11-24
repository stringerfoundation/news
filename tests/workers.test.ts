
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import worker from '../deploy/homepage-worker/worker.ts';
import redirect from '../deploy/news-redirect/worker.ts';
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
    assert.equal(response.headers.get('cache-control'), 'no-store');
    for (const name of ['etag', 'content-length', 'content-encoding', 'set-cookie', 'link'])
      assert.equal(response.headers.get(name), null);
  }

  const selected = await worker.fetch(new Request('https://example.org/?edition=en-US', {
    headers: { Cookie: 'stringer_edition=pt-PT', 'Accept-Language': 'fr' },
  }), env);
  assert.equal(selected.status, 200);
  assert.equal(selected.headers.get('set-cookie'), 'stringer_edition=en-US; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax');
  const brazil = await worker.fetch(request('/br/?edition=pt-BR'), env);
  assert.match(brazil.headers.get('set-cookie') ?? '', /^stringer_edition=pt-BR;/);
});
