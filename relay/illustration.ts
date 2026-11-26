const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 2000;
export interface CommonsImage {
  version: 1;
  url: string;
  filePage: string;
  title: string;
  alt: string;
  creator: string;
  attribution: string;
  license: string;
  licenseUrl: string;
  source?: 'openverse' | 'eu';
  sourceName?: string;
  sourceUrl?: string;
}

function https(value: unknown, allowQuery = false): URL {
  if (typeof value !== 'string') throw new Error('Invalid image URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || (!allowQuery && url.search))
    throw new Error('Invalid image URL');
  return url;
}
function publicUrl(value: unknown): URL {
  const url = https(value, true), host = url.hostname.replace(/\.$/, '');
  // Suggestions are fetched by browsers, never from local/network addresses.
  if (!host.includes('.') || /[\[\]:]/.test(host) || /^\d+(?:\.\d+)*$/.test(host) || /\.(?:local|localhost|internal|test|invalid|lan|home)$/.test(host)) throw new Error('Invalid public image URL');
  return url;
}
export function readIllustration(data: Record<string, unknown>): CommonsImage {
  if (data.version !== 1) throw new Error('Invalid image metadata version');
  for (const field of ['title', 'alt', 'creator', 'attribution', 'license']) if (!text(data[field])) throw new Error('Missing image attribution');
  const external = data.source === 'openverse' || data.source === 'eu';
  const image = external ? publicUrl(data.url) : https(data.url), page = external ? publicUrl(data.filePage) : https(data.filePage), license = https(data.licenseUrl);
  if (!external) {
    if (data.source !== undefined || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(image.hostname) || !image.pathname.startsWith('/wikipedia/commons/') ||
        page.hostname !== 'commons.wikimedia.org' || !page.pathname.startsWith('/wiki/File:')) throw new Error('Not a Commons image');
  } else {
    if (!text(data.sourceName)) throw new Error('Missing image source');
    const catalog = https(data.sourceUrl);
    if (data.source === 'openverse' && (catalog.hostname !== 'api.openverse.org' || !/^\/v1\/images\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/$/.test(catalog.pathname))) throw new Error('Invalid Openverse provenance');
    if (data.source === 'eu' && (catalog.hostname !== 'audiovisual.ec.europa.eu' || !/^\/en\/(?:media\/)?photo\/P-\d+(?:~2F|%2F)\d+-\d+$/i.test(catalog.pathname) ||
      page.href !== catalog.href || image.hostname !== 'ec.europa.eu' || !image.pathname.startsWith('/avservices/repository/photo/') || data.license !== 'CC-BY-4.0')) throw new Error('Invalid EU photo provenance');
  }
  const cc = /^(CC-BY|CC-BY-SA)-(1\.0|2\.0|2\.5|3\.0|4\.0)$/.exec(String(data.license));
  const licensePath = cc ? `/licenses/${cc[1] === 'CC-BY' ? 'by' : 'by-sa'}/${cc[2]}/` :
    data.license === 'CC0-1.0' ? '/publicdomain/zero/1.0/' : data.license === 'PDM-1.0' ? '/publicdomain/mark/1.0/' : null;
  if (license.hostname !== 'creativecommons.org' || !licensePath || license.pathname !== licensePath) throw new Error('Unsupported image license');
  return { version: 1, url: image.href, filePage: page.href,
    title: data.title as string, alt: data.alt as string, creator: data.creator as string,
    attribution: data.attribution as string, license: data.license as string, licenseUrl: license.href,
    ...(external ? { source: data.source as 'openverse' | 'eu', sourceName: data.sourceName as string, sourceUrl: data.sourceUrl as string } : {}) };
}
export function readCommonsImage(data: Record<string, unknown>): CommonsImage {
  if (data.source !== undefined) throw new Error('Not a Commons image');
  return readIllustration(data);
}
