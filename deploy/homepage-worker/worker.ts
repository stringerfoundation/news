import { isPublicAsset } from '../../public-assets.ts';
import relayConfig from '../../relay-config.ts';
import type { HTMLRewriter as CloudflareHTMLRewriter } from '@cloudflare/workers-types';

// Keep standard Fetch API types shared with Node's tests while using Cloudflare's
// authoritative handler types for the runtime-only HTML rewriting API.
interface RuntimeHTMLRewriter {
  on(...args: Parameters<CloudflareHTMLRewriter['on']>): RuntimeHTMLRewriter;
  transform(response: Response): Response;
}
declare const HTMLRewriter: { new(): RuntimeHTMLRewriter };

interface Environment {
  PUBLIC_HOST: string;
  PAGES_ORIGIN: string;
  PUBLIC_INDEXING?: string;
}

type Route =
  | { kind: 'identity' }
  | { kind: 'legacy' }
  | { kind: 'missing' }
  | { kind: 'home'; path: string }
  | { kind: 'asset'; path: string };

const prefix = '/news-assets/';
export function routeFor(request: Request): Route {
  const url = new URL(request.url);
  if (url.pathname === '/.well-known/nostr.json' && ['GET', 'HEAD', 'OPTIONS'].includes(request.method))
    return { kind: 'identity' };
  if (!['GET', 'HEAD'].includes(request.method)) return { kind: 'legacy' };
  if (url.pathname === '/') return { kind: 'home', path: '/' };
  if (!url.pathname.startsWith(prefix)) return { kind: 'legacy' };
  const path = url.pathname.slice(prefix.length);
  return isPublicAsset(path) || path === 'data/news.json'
    ? { kind: 'asset', path: '/' + path } : { kind: 'missing' };
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
    const target = new URL(env.PAGES_ORIGIN);
    if (target.protocol !== 'https:') return new Response('Invalid origin configuration', { status: 503 });
    target.pathname = target.pathname.replace(/\/$/, '') + route.path;
    target.search = new URL(request.url).search;
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
    if (route.kind === 'asset') return response;
    if (!response.headers.get('content-type')?.includes('text/html'))
      return new Response('News temporarily unavailable', { status: 502 });
    const headers = new Headers(response.headers);
    for (const name of ['etag', 'content-length', 'content-encoding', 'set-cookie', 'link']) headers.delete(name);
    headers.set('cache-control', 'no-store');
    const publicRequest = new URL(request.url).hostname === env.PUBLIC_HOST;
    if (publicRequest && env.PUBLIC_INDEXING === 'true') headers.delete('x-robots-tag');
    else headers.set('x-robots-tag', 'noindex, nofollow, noarchive, noimageindex');
    const body = new Response(response.body, { status: response.status, headers });
    if (request.method === 'HEAD') return body;
    const homepage = new URL(request.url);
    return new HTMLRewriter()
      .on('head', { element(el) { el.prepend('<base href="/news-assets/">', { html: true }); } })
      .on('a[href]', { element(el) {
        const href = el.getAttribute('href');
        if (href === './') el.setAttribute('href', '/' + homepage.search);
        else if (href?.startsWith('#')) el.setAttribute('href', '/' + homepage.search + href);
      } })
      .on('meta[name="robots"]', { element(el) {
        if (publicRequest && env.PUBLIC_INDEXING === 'true') el.remove();
      } })
      .transform(body);
  },
};
