// Explicit public files only. Development sources are never copied wholesale.
export const PUBLIC_MODULES = ['app', 'news-model', 'relay-config', 'stringer-media', 'response', 'publications'] as const;
export const PUBLIC_IMAGES = ['stringer-logo.png', 'nostr-banner.png', 'favicon-16.png', 'favicon-32.png', 'favicon-192.png', 'favicon-180.png'] as const;
export const PUBLIC_ASSETS = new Set<string>([
  ...PUBLIC_MODULES.map(name => `${name}.js`), 'relay-reader.js', 'style.css',
  ...PUBLIC_IMAGES.map(name => `assets/${name}`),
]);
export function isPublicAsset(path: string): boolean {
  return PUBLIC_ASSETS.has(path) || /^assets\/stringer-thumbnails\/[a-zA-Z0-9-]+\.png$/.test(path);
}
