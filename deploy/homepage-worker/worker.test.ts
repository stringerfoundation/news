import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { routeFor } from './worker.ts';
import { EDITIONS } from '../../reader-locales.ts';
const request = (path: string, method = 'GET') => new Request('https://example.org' + path, { method });
const environment = { PUBLIC_HOST: 'example.org', PAGES_ORIGIN: 'https://pages.example.org' };

function assertIdentity(value: unknown): asserts value is {
  names: { _: string };
  relays: Record<string, string[]>;
} {
  assert.ok(value && typeof value === 'object' && 'names' in value && 'relays' in value);
  assert.ok(value.names && typeof value.names === 'object' && '_' in value.names);
  assert.equal(typeof value.names._, 'string');
  assert.ok(value.relays && typeof value.relays === 'object');
  for (const urls of Object.values(value.relays)) {
    assert.ok(Array.isArray(urls));
    for (const url of urls) assert.equal(typeof url, 'string');
  }
}
test('only the homepage, editions and namespaced reader assets reach Pages', () => {
  for (const path of ['/', '/?utm_source=fixture']) assert.equal(routeFor(request(path)).kind, 'home');
  for (const { path } of EDITIONS.filter(edition => edition.path)) {
    assert.deepEqual(routeFor(request(`/${path}/`)), { kind: 'home', path: `/${path}/` });
    assert.equal(routeFor(request(`/${path}/extra`)).kind, 'legacy');
    assert.equal(routeFor(request(`/${path}/`, 'POST')).kind, 'legacy');
  }
  for (const path of ['/mission', '/awards', '/assets/site.css', '/robots.txt', '/sitemap.xml'])
    assert.equal(routeFor(request(path)).kind, 'legacy');
  for (const path of ['/donate', '/donate/']) assert.equal(routeFor(request(path)).kind, 'donate');
  for (const path of ['/who-we-are', '/who-we-are/']) assert.equal(routeFor(request(path)).kind, 'about');
  for (const path of ['/news-assets/app.js', '/news-assets/response.js', '/news-assets/publications.js', '/news-assets/relay-reader.js', '/news-assets/atomstr-reader.js', '/news-assets/data/news.json', '/news-assets/assets/stringer-thumbnails/photo-1.png'])
    assert.equal(routeFor(request(path)).kind, 'asset');
  for (const path of ['/news-assets/private.csv', '/news-assets/', '/news-assets/dashboard/index.html', '/news-assets/wire-images.js'])
    assert.equal(routeFor(request(path)).kind, 'missing');
  assert.equal(routeFor(request('/', 'POST')).kind, 'legacy');
  assert.equal(routeFor(request('/donate?source=fixture', 'POST')).kind, 'legacy');
});
test('edition redirects preserve query parameters and HEAD requests use the upstream edition', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async (url: URL, options?: RequestInit) => {
    assert.equal(url.href, 'https://pages.example.org/news/sw/?campaign=test');
    assert.equal(options?.method, 'HEAD');
    return new Response(null, { headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } });
  });
  const env = { ...environment, PAGES_ORIGIN: 'https://pages.example.org/news/', PUBLIC_INDEXING: 'true' };
  const redirect = await worker.fetch(request('/sw?campaign=test'), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/sw/?campaign=test');
  assert.equal(mock.mock.callCount(), 0);
  const response = await worker.fetch(request('/sw/?campaign=test', 'HEAD'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.has('x-robots-tag'), false);
  assert.equal(await response.text(), '');
  assert.equal(mock.mock.callCount(), 1);
});
test('homepage uses browser language order, quality and the configured editions', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { headers: { 'content-type': 'text/html' } }));
  for (const [language, path] of [
    ['pt-PT,pt;q=0.9,en;q=0.8', '/pt/'],
    ['pt-BR,pt;q=0.9', '/br/'],
    ['fr-CA,es;q=0.8', '/fr/'],
    ['es;q=0.4, de;q=0.9', '/de/'],
    ['it-IT,zh-Hant;q=0.9,ru;q=0.9', '/zh/'],
    ['ar;q=0,sw-KE;q=0.5', '/sw/'],
    ['en-GB,fr;q=0.8', null],
    ['it-IT,fr;q=0, *;q=0.8, ar;q=1.5', null],
    ['', null],
  ] as const) {
    const response = await worker.fetch(new Request('https://example.org/?campaign=test&source=fixture', {
      method: 'HEAD', headers: { 'Accept-Language': language },
    }), environment);
    assert.equal(response.status, path ? 302 : 200, language);
    assert.equal(response.headers.get('location'), path ? path + '?campaign=test&source=fixture' : null, language);
    assert.equal(
      response.headers.get('cache-control'),
      path ? 'no-store' : 'public, max-age=60, s-maxage=60',
    );
    assert.equal(response.headers.get('vary'), 'Accept-Language, Cookie');
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
test('saved preference wins on the homepage while direct edition links keep their language', async t => {
  const visited: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL, options?: RequestInit) => {
    visited.push(url.pathname + url.search);
    assert.equal(new Headers(options?.headers).get('cookie'), null);
    assert.equal(new Headers(options?.headers).get('accept-language'), null);
    return new Response(null, { headers: { 'content-type': 'text/html' } });
  });
  const open = (path: string, cookie: string) => worker.fetch(new Request('https://example.org' + path, {
    method: 'HEAD', headers: { Cookie: cookie, 'Accept-Language': 'fr' },
  }), environment);
  assert.equal((await open('/', 'other=value; stringer_edition=pt-PT')).headers.get('location'), '/pt/');
  assert.equal((await open('/', 'stringer_edition=invalid')).headers.get('location'), '/fr/');
  assert.equal((await open('/', 'stringer_edition=en-US')).status, 200);
  assert.equal((await open('/de/', 'stringer_edition=pt-PT')).status, 200);
  assert.equal((await open('/?edition=en-US&campaign=test', '')).status, 200);
  assert.equal((await open('/?edition=de', '')).headers.get('location'), '/fr/');
  assert.deepEqual(visited, ['/', '/de/', '/?campaign=test']);
});
test('donation links redirect GET and HEAD to the external page, preserving attribution', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Donation redirects must not reach an origin'); });
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/donate?utm_source=fixture&campaign=spring', '/donate/?source=fixture']) {
      const response = await worker.fetch(request(path, method), environment);
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), 'https://stringerjournalism.org/get-involved' + new URL('https://example.org' + path).search);
      assert.equal(await response.text(), '');
    }
  }
});
test('who-we-are redirects GET and HEAD to about, preserving the query string', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('About redirects must not reach an origin'); });
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/who-we-are?utm_source=fixture&campaign=spring', '/who-we-are/?source=fixture']) {
      const response = await worker.fetch(request(path, method), environment);
      assert.equal(response.status, 301);
      assert.equal(response.headers.get('location'), '/about' + new URL('https://example.org' + path).search);
      assert.equal(await response.text(), '');
    }
  }
  assert.equal(routeFor(request('/who-we-are', 'POST')).kind, 'legacy');
});
test('apex NIP-05 identifies the Stringer profile directly with browser CORS support', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Identity must not depend on an upstream request'); });
  const response = await worker.fetch(request('/.well-known/nostr.json?name=_'), environment);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/);
  const identity: unknown = await response.json();
  assertIdentity(identity);
  const pubkey = 'b8225dbedf6ae7949e880e7979e975d8e6f238f32d318bc4a562ecb198fcd707';
  assert.deepEqual(identity.names, { _: pubkey });
  assert.ok(identity.relays[pubkey]?.every(url => url.startsWith('wss://')));
  for (const method of ['HEAD', 'OPTIONS']) {
    const result = await worker.fetch(request('/.well-known/nostr.json', method), environment);
    assert.equal(result.status, method === 'OPTIONS' ? 204 : 200);
    assert.equal(await result.text(), '');
    assert.equal(result.headers.get('access-control-allow-origin'), '*');
  }
});
test('existing-page methods, query, headers and body pass to the origin unchanged', async t => {
  const original = request('/donate?source=fixture', 'POST');
  t.mock.method(globalThis, 'fetch', async (outgoing: RequestInfo | URL) => {
    assert.equal(outgoing, original);
    return new Response('Existing donation page');
  });
  const response = await worker.fetch(original, environment);
  assert.equal(await response.text(), 'Existing donation page');
});
test('Pages asset requests retain query but omit visitor credentials', async t => {
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(String(url), 'https://pages.example.org/app.js?v=1');
    assert.equal(new Headers(options?.headers).get('cookie'), null);
    assert.equal(new Headers(options?.headers).get('authorization'), null);
    return new Response('fixture module');
  });
  const response = await worker.fetch(new Request('https://example.org/news-assets/app.js?v=1', {
    headers: { Cookie: 'private=session', Authorization: 'Bearer fixture' },
  }), { PAGES_ORIGIN: 'https://pages.example.org', PUBLIC_HOST: 'example.org' });
  assert.equal(await response.text(), 'fixture module');
});
test('unavailable reader origin reports failure', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.equal((await worker.fetch(request('/'), environment)).status, 502);
});

test('GitHub project Pages keeps its repository path for homepage and assets', async t => {
  const visited: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    visited.push(String(url));
    assert.equal(options?.redirect, 'manual');
    return new Response(null, { headers: { 'content-type': 'text/html' } });
  });
  const env = { PAGES_ORIGIN: 'https://example.github.io/stringer-news/', PUBLIC_HOST: 'example.org' };
  assert.equal((await worker.fetch(request('/?campaign=test', 'HEAD'), env)).status, 200);
  assert.equal((await worker.fetch(request('/news-assets/style.css?v=abc'), env)).status, 200);
  assert.deepEqual(visited, ['https://example.github.io/stringer-news/?campaign=test', 'https://example.github.io/stringer-news/style.css?v=abc']);
});
