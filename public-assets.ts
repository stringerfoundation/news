import { EDITIONS } from './reader-locales.ts';
// Explicit public files only. Development sources are never copied wholesale.
export const PUBLIC_MODULES = ['app', 'news-model', 'relay-config', 'stringer-media', 'response', 'publications'] as const;
export const PUBLIC_IMAGES = ['stringer-logo.png', 'nostr-banner.png', 'favicon-16.png', 'favicon-32.png', 'favicon-192.png', 'favicon-180.png'] as const;
export const PUBLIC_ASSETS = new Set<string>([
  ...EDITIONS.filter(edition => edition.path).map(edition => `${edition.path}/headlines.json`),
  ...PUBLIC_MODULES.map(name => `${name}.js`), 'relay-reader.js', 'atomstr-reader.js', 'style.css',
  ...PUBLIC_IMAGES.map(name => `assets/${name}`),
]);
export function isHeadlineThumbnail(path: string): boolean {
  return /^assets\/headline-thumbnails\/[0-9a-f]{64}\.webp$/.test(path);
}
export function isPublicAsset(path: string): boolean {
  return PUBLIC_ASSETS.has(path) || path === 'data/news.json' || isHeadlineThumbnail(path) ||
    /^assets\/stringer-thumbnails\/[a-zA-Z0-9-]+\.png$/.test(path);
}
