import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { routeFor } from './worker.mjs';
const request = (path, method = 'GET') => new Request('https://example.org' + path, { method });
test('only homepage and namespaced reader assets reach Pages', () => {
  for (const path of ['/', '/?utm_source=fixture']) assert.equal(routeFor(request(path)).kind, 'home');
  for (const path of ['/donate', '/mission', '/awards', '/assets/site.css', '/robots.txt', '/sitemap.xml'])
    assert.equal(routeFor(request(path)).kind, 'legacy');
  for (const path of ['/news-assets/app.js', '/news-assets/relay-reader.js', '/news-assets/assets/stringer-thumbnails/photo-1.png'])
    assert.equal(routeFor(request(path)).kind, 'asset');
  for (const path of ['/news-assets/private.csv', '/news-assets/', '/news-assets/dashboard/index.html', '/news-assets/wire-images.js'])
    assert.equal(routeFor(request(path)).kind, 'missing');
  assert.equal(routeFor(request('/', 'POST')).kind, 'legacy');
});
test('apex NIP-05 identifies the Stringer profile directly with browser CORS support', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Identity must not depend on an upstream request'); });
  const response = await worker.fetch(request('/.well-known/nostr.json?name=_'), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('content-type'), /^application\/json/);
  const identity = await response.json();
  const pubkey = 'b8225dbedf6ae7949e880e7979e975d8e6f238f32d318bc4a562ecb198fcd707';
  assert.deepEqual(identity.names, { _: pubkey });
  assert.ok(identity.relays[pubkey].every(url => url.startsWith('wss://')));
  for (const method of ['HEAD', 'OPTIONS']) {
    const result = await worker.fetch(request('/.well-known/nostr.json', method), {});
    assert.equal(result.status, method === 'OPTIONS' ? 204 : 200);
    assert.equal(await result.text(), '');
    assert.equal(result.headers.get('access-control-allow-origin'), '*');
  }
});
test('existing-page methods, query, headers and body pass to the origin unchanged', async t => {
  const original = request('/donate?source=fixture', 'POST');
  t.mock.method(globalThis, 'fetch', async outgoing => {
    assert.equal(outgoing, original);
    return new Response('Existing donation page');
  });
  const response = await worker.fetch(original, { PUBLIC_HOST: 'example.org' });
  assert.equal(await response.text(), 'Existing donation page');
});
test('Pages asset requests retain query but omit visitor credentials', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://pages.example.org/app.js?v=1');
    assert.equal(new Headers(options.headers).get('cookie'), null);
    assert.equal(new Headers(options.headers).get('authorization'), null);
    return new Response('fixture module');
  });
  const response = await worker.fetch(new Request('https://example.org/news-assets/app.js?v=1', {
    headers: { Cookie: 'private=session', Authorization: 'Bearer fixture' },
  }), { PAGES_ORIGIN: 'https://pages.example.org', PUBLIC_HOST: 'example.org' });
  assert.equal(await response.text(), 'fixture module');
});
test('unavailable reader origin reports failure', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.equal((await worker.fetch(request('/'), { PAGES_ORIGIN: 'https://pages.example.org' })).status, 502);
});

test('GitHub project Pages keeps its repository path for homepage and assets', async t => {
  const visited = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    visited.push(String(url));
    assert.equal(options.redirect, 'manual');
    return new Response(null, { headers: { 'content-type': 'text/html' } });
  });
  const env = { PAGES_ORIGIN: 'https://example.github.io/stringer-news/', PUBLIC_HOST: 'example.org' };
  assert.equal((await worker.fetch(request('/?campaign=test', 'HEAD'), env)).status, 200);
  assert.equal((await worker.fetch(request('/news-assets/style.css?v=abc'), env)).status, 200);
  assert.deepEqual(visited, ['https://example.github.io/stringer-news/?campaign=test', 'https://example.github.io/stringer-news/style.css?v=abc']);
});
