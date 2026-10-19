import { readCommonsImage, type CommonsImage } from './images.js';

function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Parse into an inert document, then return text only. Never insert Commons HTML.
  return new DOMParser().parseFromString(value, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 2000) || '';
}
export async function searchCommons(query: string, request: typeof fetch = fetch): Promise<CommonsImage[]> {
  if (!query.trim()) throw new Error('Enter a person, place or subject to search for.');
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '10', gsrsearch: query.trim().slice(0, 200),
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '320' }).toString();
  const response = await request(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Commons search is unavailable. Please retry.');
  const data = await response.json() as { error?: unknown; query?: { pages?: { index?: number; title?: string; imageinfo?: { mime?: string; thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }[] } };
  if (data.error) throw new Error('Commons search is unavailable. Please retry.');
  const results: CommonsImage[] = [];
  for (const page of [...(data.query?.pages || [])].sort((a, b) => (a.index || 0) - (b.index || 0))) {
    const info = page.imageinfo?.[0], meta = info?.extmetadata;
    if (!info || !meta || !/^image\/(jpeg|png|webp)$/.test(info.mime || '') || plain(meta.Restrictions?.value)) continue;
    const licenseUrl = plain(meta.LicenseUrl?.value).replace(/^http:/, 'https:').replace(/\/deed\.[a-z-]+$/, '/').replace(/\/?$/, '/');
    const license = /^https:\/\/creativecommons\.org\/licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)\/$/.exec(licenseUrl);
    const identifier = license ? `CC-${license[1]!.toUpperCase()}-${license[2]}` :
      licenseUrl === 'https://creativecommons.org/publicdomain/zero/1.0/' ? 'CC0-1.0' :
      licenseUrl === 'https://creativecommons.org/publicdomain/mark/1.0/' ? 'PDM-1.0' : '';
    try {
      const title = plain(meta.ObjectName?.value) || (page.title || '').replace(/^File:/, '');
      const creator = plain(meta.Artist?.value);
      const imageUrl = new URL(info.thumburl || info.url || '');
      imageUrl.search = ''; imageUrl.hash = '';
      results.push(readCommonsImage({ version: 1, url: imageUrl.href, filePage: info.descriptionurl, title,
        alt: plain(meta.ImageDescription?.value) || title, creator,
        attribution: plain(meta.Attribution?.value) || plain(meta.Credit?.value) || creator, license: identifier, licenseUrl }));
    } catch { /* Incomplete licenses/credits or unsupported files remain absent. */ }
    if (results.length >= 5) break;
  }
  return results;
}
