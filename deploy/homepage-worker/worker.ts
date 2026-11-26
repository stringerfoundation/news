import { isPublicAsset } from '../../public-assets.ts';
import { EDITIONS, localeForLanguage, type Locale } from '../../reader-locales.ts';
import relayConfig from '../../relay-config.ts';
import type { HTMLRewriter as CloudflareHTMLRewriter } from '@cloudflare/workers-types';

// Keep standard Fetch API types shared with Node's tests while using Cloudflare's
// authoritative handler types for the runtime-only HTML rewriting API.
interface RuntimeHTMLRewriter {
  on(...args: Parameters<CloudflareHTMLRewriter['on']>): RuntimeHTMLRewriter;
  transform(response: Response): Response;
}
declare const HTMLRewriter: { new(): RuntimeHTMLRewriter };

declare const caches: CacheStorage & { readonly default: Cache };

interface Environment {
  PUBLIC_HOST: string;
  PAGES_ORIGIN: string;
  PUBLIC_INDEXING?: string;
}

type Route =
  | { kind: 'identity' }
  | { kind: 'donate'; search: string }
  | { kind: 'about'; search: string }
  | { kind: 'legacy' }
  | { kind: 'missing' }
  | { kind: 'edition-redirect'; location: string }
  | { kind: 'home'; path: string }
  | { kind: 'asset'; path: string };

const prefix = '/news-assets/';
const editionPaths = new Map<string, Locale>(EDITIONS.map(({ path, locale }) => [path ? `/${path}/` : '/', locale]));
const pathsByLocale = new Map<string, string>([...editionPaths].map(([path, locale]) => [locale, path]));
const editionCookie = 'stringer_edition';
const languageVary = 'Accept-Language, Cookie';

function browserEdition(header: string) {
  const preferences = header.split(',').flatMap(value => {
    const match = /^\s*([a-z]{1,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(value);
    if (!match?.[1]) return [];
    const weight = Number(match[2] ?? 1);
    if (weight === 0) return [];
    const tag = match[1].toLowerCase();
    const locale = localeForLanguage(tag);
    return locale !== 'en-US' || tag === 'en' || tag.startsWith('en-') ? [{ locale, weight }] : [];
  });
  return preferences.sort((a, b) => b.weight - a.weight)[0]?.locale ?? 'en-US';
}

function savedEdition(request: Request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(editionCookie + '='))?.slice(editionCookie.length + 1) ?? '';
}

export function routeFor(request: Request): Route {
  const url = new URL(request.url);
  if (url.pathname === '/.well-known/nostr.json' && ['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    return { kind: 'identity' };
  if (!['GET', 'HEAD'].includes(request.method)) return { kind: 'legacy' };
  if (url.pathname === '/donate' || url.pathname === '/donate/')
    return { kind: 'donate', search: url.search };
  if (url.pathname === '/who-we-are' || url.pathname === '/who-we-are/')
    return { kind: 'about', search: url.search };
  if (editionPaths.has(url.pathname)) return { kind: 'home', path: url.pathname };
  if (editionPaths.has(url.pathname + '/'))
    return { kind: 'edition-redirect', location: url.pathname + '/' + url.search };
  if (!url.pathname.startsWith(prefix)) return { kind: 'legacy' };
  const path = url.pathname.slice(prefix.length);
  return isPublicAsset(path) ? { kind: 'asset', path: '/' + path } : { kind: 'missing' };
}

/** Short shared TTLs only. Never immutable: ?v= paths are not content-addressed. */
export function assetCacheControl(path: string): string {
  if (path.endsWith('.json')) return 'public, max-age=60, s-maxage=300';
  if (/\.(?:js|css)$/.test(path)) return 'public, max-age=60, s-maxage=300';
  return 'public, max-age=86400'; // Remaining allowlisted assets are images.
}

/** HTML links preserve the request query, and indexing depends on the host configuration. */
export function edgeCacheKey(
  request: Request,
  route: Extract<Route, { kind: 'home' | 'asset' }>,
  env: Environment,
): Request {
  const url = new URL(request.url);
  if (route.kind === 'home') {
    url.pathname = route.path;
    const indexed = env.PUBLIC_INDEXING === 'true' && url.hostname === env.PUBLIC_HOST;
    url.searchParams.append('__index', indexed ? '1' : '0');
  }
  return new Request(url.toString(), { method: 'GET' });
}

function withCacheStatus(response: Response, status: 'HIT' | 'MISS'): Response {
  const headers = new Headers(response.headers);
  headers.set('x-worker-cache', status);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readEdgeCache(key: Request): Promise<Response | undefined> {
  try {
    return await caches.default.match(key);
  } catch {
    return undefined;
  }
}

async function writeEdgeCache(key: Request, response: Response): Promise<void> {
  try {
    await caches.default.put(key, response.clone());
  } catch {
    /* Cache is best-effort in local tests and constrained runtimes. */
  }
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const route = routeFor(request);
    if (route.kind === 'identity') {
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Cache-Control': 'public, max-age=300',
      };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const body = JSON.stringify({
        names: { _: relayConfig.pubkey },
        relays: { [relayConfig.pubkey]: relayConfig.relays },
      });
      return new Response(request.method === 'HEAD' ? null : body, { headers });
    }
    if (route.kind === 'donate')
      return new Response(null, {
        status: 301,
        headers: { Location: 'https://stringerjournalism.org/get-involved' + route.search },
      });
    if (route.kind === 'about')
      return new Response(null, {
        status: 301,
        headers: { Location: '/about' + route.search },
      });
    if (route.kind === 'legacy') {
      // On a Cloudflare Route, fetch(request) reaches the existing DNS origin.
      // A separate origin is used only for workers.dev preview requests.
      if (new URL(request.url).hostname === env.PUBLIC_HOST) return fetch(request);
      const legacy = new URL(request.url);
      legacy.host = env.PUBLIC_HOST;
      legacy.protocol = 'https:';
      return fetch(new Request(legacy, request));
    }
    if (route.kind === 'missing') return new Response('Not found', { status: 404 });
    if (route.kind === 'edition-redirect')
      return new Response(null, { status: 308, headers: { Location: route.location } });
    const page = new URL(request.url);
    const choice = page.searchParams.get('edition');
    const explicitEdition = route.kind === 'home' && choice !== null &&
      choice === editionPaths.get(route.path) ? choice : null;
    if (route.kind === 'home' && route.path === '/' && !explicitEdition) {
      const preferredPath = pathsByLocale.get(savedEdition(request)) ??
        pathsByLocale.get(browserEdition(request.headers.get('accept-language') ?? ''));
      if (preferredPath && preferredPath !== '/') {
        if (choice !== null) page.searchParams.delete('edition');
        return new Response(null, {
          status: 302,
          headers: { Location: preferredPath + page.search, 'Cache-Control': 'no-store', Vary: languageVary },
        });
      }
    }

    const cacheable = request.method === 'GET' && !explicitEdition;
    const cacheKey = cacheable ? edgeCacheKey(request, route, env) : null;
    if (cacheKey) {
      const cached = await readEdgeCache(cacheKey);
      if (cached) return withCacheStatus(cached, 'HIT');
    }

    const target = new URL(env.PAGES_ORIGIN);
    if (target.protocol !== 'https:') return new Response('Invalid origin configuration', { status: 503 });
    target.pathname = target.pathname.replace(/\/$/, '') + route.path;
    target.search = page.search;
    if (explicitEdition) target.searchParams.delete('edition');
    let response;
    try {
      // Never forward visitor cookies or authentication to the public Pages origin.
      response = await fetch(target, {
        method: request.method, redirect: 'manual',
        headers: { Accept: route.kind === 'home' ? 'text/html' : '*/*' },
      });
    } catch {
      return new Response('News temporarily unavailable', { status: 502 });
    }
    if (!response.ok) return new Response('News temporarily unavailable', { status: 502 });
    if (route.kind === 'asset') {
      const cacheControl = assetCacheControl(route.path);
      const headers = new Headers(response.headers);
      headers.set('cache-control', cacheControl);
      let out = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      out = withCacheStatus(out, 'MISS');
      if (cacheKey) await writeEdgeCache(cacheKey, out);
      return out;
    }
    if (!response.headers.get('content-type')?.includes('text/html'))
      return new Response('News temporarily unavailable', { status: 502 });
    const headers = new Headers(response.headers);
    for (const name of ['etag', 'content-length', 'content-encoding', 'set-cookie', 'link']) headers.delete(name);
    headers.set('cache-control', explicitEdition ? 'no-store' : 'public, max-age=60, s-maxage=60');
    if (route.path === '/') headers.append('vary', languageVary);
    if (explicitEdition && request.method === 'GET') {
      headers.set('set-cookie', `${editionCookie}=${explicitEdition}; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`);
    }
    const publicRequest = page.hostname === env.PUBLIC_HOST;
    if (publicRequest && env.PUBLIC_INDEXING === 'true') headers.delete('x-robots-tag');
    else headers.set('x-robots-tag', 'noindex, nofollow, noarchive, noimageindex');
    const body = new Response(response.body, { status: response.status, headers });
    if (request.method === 'HEAD') return withCacheStatus(body, 'MISS');
    // Edition documents use ../ for shared assets, so keep their depth under the asset prefix.
    const assetBase = prefix + route.path.slice(1);
    // Promise.resolve accepts the runtime's sync transform and Node test doubles that return a Promise.
    const rewritten = await Promise.resolve(new HTMLRewriter()
      .on('head', { element(el) { el.prepend(`<base href="${assetBase}">`, { html: true }); } })
      .on('a[href]', { element(el) {
        const href = el.getAttribute('href');
        if (href === './') el.setAttribute('href', page.pathname + page.search);
        else if (href?.startsWith('#')) el.setAttribute('href', page.pathname + page.search + href);
      } })
      .on('.edition-switcher a[hreflang][href]', { element(el) {
        const href = el.getAttribute('href');
        if (!href) return;
        const edition = new URL(href, page);
        const locale = editionPaths.get(edition.pathname);
        if (edition.origin === page.origin && locale) {
          edition.search = page.search;
          edition.searchParams.set('edition', locale);
          el.setAttribute('href', edition.pathname + edition.search + edition.hash);
        }
      } })
      .on('meta[name="robots"]', { element(el) {
        if (publicRequest && env.PUBLIC_INDEXING === 'true') el.remove();
      } })
      .transform(body));
    const out = withCacheStatus(rewritten, 'MISS');
    if (cacheKey) await writeEdgeCache(cacheKey, out);
    return out;
  },
};
