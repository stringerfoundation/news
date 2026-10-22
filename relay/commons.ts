import { readCommonsImage, type CommonsImage } from './images.js';

const places: Record<string, string> = {
  Saudi: 'Saudi Arabia', British: 'United Kingdom', French: 'France', German: 'Germany',
  American: 'United States', Chinese: 'China', Indian: 'India', Pakistani: 'Pakistan',
  Russian: 'Russia', Ukrainian: 'Ukraine', Iranian: 'Iran', Israeli: 'Israel', Palestinian: 'Palestine',
};

/** A search hint, never a claim that the returned file depicts the subject. */
export function commonsSubject(title: string): string {
  const names = [...title.matchAll(/\p{Lu}[\p{L}\p{M}'’.-]*(?:\s+(?:(?:de|del|der|van|von|le)\s+)*\p{Lu}[\p{L}\p{M}'’.-]*)*/gu)].map(match => match[0]
    .replace(/^(?:Ex-|Former\s+)/, '')
    .split(/\s+(?:Prompt|Prompts|Says|Say|Hits|Warns|Faces|Under|Over|Will|Would|Could|May|Must|As|Has|Have|Is|Are|Was|Were|Sparks|Questions)\b/)[0]!);
  // Title-style introductions such as "The Failures of" describe the article,
  // rather than the person/place that follows them.
  const subject = names.find(name => !/^(The|A|An)\b/.test(name) && !/^(How|Why|What|After|Before|Flooding|Talks|Deaths|Death|New|Latest|Live|Breaking|Opinion|Analysis|Watch|Photos)$/.test(name));
  return (places[subject || ''] || subject || title).trim().slice(0, 200);
}

function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Parse into an inert document, then return text only. Never insert Commons HTML.
  return new DOMParser().parseFromString(value, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 2000) || '';
}
interface ImagePage { index?: number; title?: string; imageinfo?: { mime?: string; thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }
interface CommonsResponse { error?: unknown; query?: { pages?: ImagePage[] } }
async function representativeImages(query: string, request: typeof fetch): Promise<CommonsImage[]> {
  try {
    const wiki = new URL('https://en.wikipedia.org/w/api.php');
    wiki.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'search', gsrnamespace: '0', gsrlimit: '1', gsrsearch: query,
      prop: 'pageimages|images', piprop: 'name', pilicense: 'free', imlimit: '100' }).toString();
    const response = await request(wiki, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const data = await response.json() as { query?: { pages?: { title?: string; pageimage?: string; images?: { title?: string }[] }[] } };
    const page = data.query?.pages?.[0];
    if (!page) return [];
    const subject = page.title?.toLocaleLowerCase() || query.toLocaleLowerCase();
    const maps = (page.images || []).map(image => image.title || '').filter(title =>
      title.toLocaleLowerCase().includes(subject) && /map|orthographic|location/i.test(title));
    const titles = [...new Set([...(page.pageimage ? [`File:${page.pageimage}`] : []), ...maps])].slice(0, 4);
    if (!titles.length) return [];
    const commons = new URL('https://commons.wikimedia.org/w/api.php');
    commons.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*',
      titles: titles.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '320' }).toString();
    const files = await request(commons, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
    if (!files.ok) return [];
    const result = await files.json() as CommonsResponse;
    for (const image of result.query?.pages || []) image.index = titles.findIndex(title => title.replaceAll('_', ' ') === image.title);
    return readImages(result);
  } catch { return []; /* Optional subject lookup can fall back to Commons search. */ }
}
export async function searchCommons(query: string, request: typeof fetch = fetch, suggest = false): Promise<CommonsImage[]> {
  if (!query.trim()) throw new Error('Enter a person, place or subject to search for.');
  const preferred = suggest ? representativeImages(query.trim().slice(0, 200), request) : Promise.resolve([]);
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '10', gsrsearch: `${query.trim().slice(0, 200)} filetype:bitmap`,
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '320' }).toString();
  const response = await request(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Commons search is unavailable. Please retry.');
  const data = await response.json() as CommonsResponse;
  if (data.error) throw new Error('Commons search is unavailable. Please retry.');
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const words = normalize(query).split(' ');
  const alternatives = readImages(data).filter(image => !suggest || words.every(word =>
    normalize(`${image.title} ${decodeURIComponent(new URL(image.filePage).pathname)}`).split(' ').includes(word)));
  const images = [...await preferred, ...alternatives];
  return images.filter((image, index) => images.findIndex(other => other.filePage === image.filePage) === index).slice(0, 5);
}
function readImages(data: CommonsResponse): CommonsImage[] {
  if (data.error) return [];
  const results: CommonsImage[] = [];
  for (const page of [...(data.query?.pages || [])].sort((a, b) => (a.index || 0) - (b.index || 0))) {
    const info = page.imageinfo?.[0], meta = info?.extmetadata;
    const rasterThumbnail = info?.mime === 'image/svg+xml' && /\.png(?:\?|$)/.test(info.thumburl || '');
    if (!info || !meta || (!/^image\/(jpeg|png|webp)$/.test(info.mime || '') && !rasterThumbnail) || plain(meta.Restrictions?.value)) continue;
    const publicDomain = plain(meta.License?.value) === 'pd' && plain(meta.Copyrighted?.value).toLowerCase() === 'false' &&
      plain(meta.UsageTerms?.value).toLowerCase() === 'public domain';
    const licenseUrl = (plain(meta.LicenseUrl?.value) || (publicDomain ? 'https://creativecommons.org/publicdomain/mark/1.0/' : ''))
      .replace(/^http:/, 'https:').replace(/\/deed\.[a-z-]+$/, '/').replace(/\/?$/, '/');
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
