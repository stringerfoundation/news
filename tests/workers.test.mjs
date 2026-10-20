import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import worker from '../deploy/homepage-worker/worker.ts';
import redirect from '../deploy/news-redirect/worker.ts';
const env = { PUBLIC_HOST: 'example.org', PAGES_ORIGIN: 'https://pages.example.org/' };
const request = (path = '/', host = 'example.org') => new Request(`https://${host}${path}`);
// Exercise the worker's HTMLRewriter callbacks against a parsed document.
class Rewriter {
  handlers = [];
  on(selector, handler) {
    this.handlers.push([selector, handler]);
    return this;
  }
  async transform(response) {
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
  t.mock.method(globalThis, 'fetch', async (outgoing) => {
    assert.equal(outgoing.url, 'https://example.org/donate?x=1');
    return new Response('legacy');
  });
  assert.equal(
    await (await worker.fetch(request('/donate?x=1', 'preview.example.org'), env)).text(),
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
  globalThis.HTMLRewriter = Rewriter;
  t.after(() => {
    delete globalThis.HTMLRewriter;
  });
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        '<html><head><meta name="robots" content="noindex"></head><body><a href="./">Home</a><a href="#stories">Stories</a><a href="https://outside.org">Outside</a></body></html>',
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
      ),
  );
  for (const [host, indexing, publicIndex] of [
    ['example.org', 'true', true],
    ['preview.example.org', 'true', false],
    ['example.org', 'false', false],
  ]) {
    const response = await worker.fetch(request('/?campaign=test', host), {
      ...env,
      PUBLIC_INDEXING: indexing,
    });
    const $ = load(await response.text());
    assert.equal($('base').attr('href'), '/news-assets/');
    assert.equal($('a').eq(0).attr('href'), '/?campaign=test');
    assert.equal($('a').eq(1).attr('href'), '/?campaign=test#stories');
    assert.equal($('a').eq(2).attr('href'), 'https://outside.org');
    assert.equal($('meta[name="robots"]').length, publicIndex ? 0 : 1);
    assert.equal(response.headers.has('x-robots-tag'), !publicIndex);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    for (const name of ['etag', 'content-length', 'content-encoding', 'set-cookie', 'link'])
      assert.equal(response.headers.get(name), null);
  }
});
