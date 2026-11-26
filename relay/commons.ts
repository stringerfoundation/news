import { readCommonsImage, type CommonsImage } from './illustration.js';
import { plain } from './plain.js';

const places: Record<string, string> = {
  Saudi: 'Saudi Arabia', British: 'United Kingdom', French: 'France', German: 'Germany',
  American: 'United States', Chinese: 'China', Indian: 'India', Pakistani: 'Pakistan',
  Russian: 'Russia', Ukrainian: 'Ukraine', Iranian: 'Iran', Israeli: 'Israel', Palestinian: 'Palestine',
};

/** A search hint, never a claim that the returned file depicts the subject. */
export function commonsSubject(title: string): string {
  // For headlines about a population affected in a named place, imagery is
  // usually more useful when it centers the place than a generic group label.
  const geographicContext = /\b(?:[Pp]eople|[Rr]esidents|[Rr]efugees|[Mm]igrants|[Ff]amilies|[Cc]hildren|[Cc]ivilians|[Vv]illagers|[Ff]armers|[Ww]orkers|[Ss]tudents|[Vv]oters|[Jj]udges|[Pp]rosecutors|[Ll]awmakers|\p{Lu}[\p{L}\p{M}'’.-]*(?:ians|ans|ese))\s+in\s+(\p{Lu}[\p{L}\p{M}'’.-]*(?:\s+(?:de|del|der|van|von|le)?\s*\p{Lu}[\p{L}\p{M}'’.-]+)*)/u.exec(title);
  if (geographicContext?.[1]) {
    const place = geographicContext[1].split(/\s+(?:Suggest|Suggests|Says|Say|Calls|Call|Warns|Warn|Faces|Face|Move|Moves|Could|Would|Will|Should|Propose|Proposes|Drop|Drops|Cut|Cuts|Flee|Fleeing)\b/)[0]!;
    return place.trim().slice(0, 200);
  }
  const names = [...title.matchAll(/\p{Lu}[\p{L}\p{M}'’.-]*(?:\s+(?:(?:de|del|der|van|von|le)\s+)*\p{Lu}[\p{L}\p{M}'’.-]*)*/gu)].map(match => ({
    name: match[0].replace(/^(?:Ex-|Former\s+)/, '').split(/\s+(?:Prompt|Prompts|Suggest|Suggests|Says|Say|Hits|Warns|Faces|Under|Over|Will|Would|Could|May|Must|As|Has|Have|Is|Are|Was|Were|Sparks|Questions)\b/)[0]!,
    index: match.index,
  }));
  // Title-style introductions such as "The Failures of" describe the article,
  // rather than the person/place that follows them.
  const ignored = /^(?:A|An|The|At|By|For|From|In|Into|Of|On|Onto|To|With|As|After|Before|Across|Against|Among|Around|Through|During|Despite|Following|While|When|Where|Why|How|What|Who|Which|Whose|Is|Are|Was|Were|Be|Been|Being|Do|Does|Did|Have|Has|Had|Can|Could|May|Might|Must|Shall|Should|Will|Would|And|But|Or|Nor|So|Yet|If|Then|Than|This|That|These|Those|My|Your|His|Her|Its|Our|Their|Latest|Live|Breaking|Opinion|Analysis|Watch|Photos|Praise|Failings|Failure|Failures|Talks|Deaths|Death|Flooding|Says|Say|More|Why)$/i;
  const candidates = names.map(({ name, index }) => {
    const words = name.split(/\s+/);
    const start = words.findIndex(word => !ignored.test(word));
    const candidate = start < 0 ? '' : words.slice(start).join(' ');
    const clean = candidate === 'New' ? '' : candidate;
    const prefix = title.slice(0, index).trimEnd();
    return { candidate: clean, contextualPhrase: !!clean && clean.includes(' ') && /\p{Ll}$/u.test(prefix) };
  }).filter(item => item.candidate);
  // Multiword names after a lowercase connector or role noun are strong clues:
  // "in New Delhi", "of Emmanuel Macron", and "actor Gerard Depardieu".
  const subject = candidates.find(item => item.contextualPhrase)?.candidate || candidates[0]?.candidate;
  return (places[subject || ''] || subject || title).trim().slice(0, 200);
}
interface ImagePage { index?: number; title?: string; imageinfo?: { mime?: string; thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }
interface CommonsResponse { error?: unknown; query?: { pages?: ImagePage[] } }
interface WikipediaPage { title?: string; pageimage?: string; images?: { title?: string }[] }

function namedSubjects(headline: string): string[] {
  const namePattern = /(?<![\p{L}\p{M}])\p{Lu}[\p{L}\p{M}'’.-]+(?:\s+(?:(?:de|del|des|du|der|van|von|le)\s+)*\p{Lu}[\p{L}\p{M}'’.-]+)*/gu;
  const names = [...new Set(Array.from(headline.matchAll(namePattern), ([name]) => name!.replace(/[.'’-]+$/, '')))];
  const phrases = names.filter(name => name.includes(' '));
  const singleNames = names.filter(name => !name.includes(' ') && name.length >= 4);
  return [...phrases, ...singleNames].slice(0, 5);
}

function headlineMentionsSubject(headline: string, title: string): boolean {
  const phrase = (value: string) => value.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  const subject = phrase(title);
  const text = phrase(headline);
  return subject.length >= 2 && (/\p{Script=Han}/u.test(subject)
    ? text.includes(subject) : ` ${text} `.includes(` ${subject} `));
}

async function wikipediaPages(wiki: URL, params: Record<string, string>, request: typeof fetch, timeout = 8000): Promise<WikipediaPage[]> {
  wiki.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*',
    prop: 'pageimages|images', piprop: 'name', pilicense: 'free', imlimit: '100', ...params }).toString();
  const response = await request(wiki, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) return [];
  const data = await response.json() as { query?: { pages?: WikipediaPage[] } };
  return data.query?.pages ?? [];
}

function representativeFiles(pages: WikipediaPage[], query: string): string[] {
  return [...new Set(pages.flatMap(page => {
    const subject = page.title?.toLowerCase() || query.toLowerCase();
    const maps = (page.images || []).map(image => image.title || '').filter(title =>
      title.toLowerCase().includes(subject) && /map|orthographic|location/i.test(title));
    return [...(page.pageimage ? [`File:${page.pageimage}`] : []), ...maps];
  }))].slice(0, 4);
}

async function representativeImages(query: string, request: typeof fetch, language: string): Promise<CommonsImage[]> {
  try {
    const localized = language !== 'en';
    const wiki = new URL('https://en.wikipedia.org/w/api.php');
    if (/^[a-z]{2,3}$/.test(language)) wiki.hostname = `${language}.wikipedia.org`;
    const subjects = localized ? namedSubjects(query) : [];
    let titles: string[] = [];
    if (subjects.length) {
      const pages = await wikipediaPages(wiki, { titles: subjects.join('|'), redirects: '1' }, request, 2500).catch(() => []);
      // Wikipedia can return titles out of order. Prefer the names as ranked in the headline.
      const ordered = subjects.flatMap(subject => pages.filter(page => page.title?.toLowerCase() === subject.toLowerCase()));
      titles = representativeFiles(ordered, query);
    }
    if (!titles.length) {
      const pages = await wikipediaPages(wiki, { generator: 'search', gsrnamespace: '0',
        gsrlimit: localized ? '5' : '1', gsrsearch: query }, request);
      const matches = localized ? pages.filter(page => headlineMentionsSubject(query, page.title ?? '')) : pages.slice(0, 1);
      titles = representativeFiles(matches, query);
    }
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
export async function searchCommons(query: string, request: typeof fetch = fetch, suggest = false, language = 'en', onRepresentative?: (images: CommonsImage[]) => void): Promise<CommonsImage[]> {
  if (!query.trim()) throw new Error('Enter a person, place or subject to search for.');
  const preferred = suggest ? representativeImages(query.trim().slice(0, 200), request, language).then(images => {
    if (images.length) onRepresentative?.(images);
    return images;
  }) : Promise.resolve([]);
  const alternatives = searchCommonsFiles(query, request, suggest).catch(async error => {
    if (!(await preferred).length) throw error;
    return [];
  });
  const [representatives, matches] = await Promise.all([preferred, alternatives]);
  const images = [...representatives, ...matches];
  return images.filter((image, index) => images.findIndex(other => other.filePage === image.filePage) === index).slice(0, 5);
}

async function searchCommonsFiles(query: string, request: typeof fetch, suggest: boolean): Promise<CommonsImage[]> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrnamespace: '6', gsrlimit: '10', gsrsearch: `${query.trim().slice(0, 200)} filetype:bitmap`,
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '320' }).toString();
  const response = await request(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Commons search is unavailable. Please retry.');
  const data = await response.json() as CommonsResponse;
  if (data.error) throw new Error('Commons search is unavailable. Please retry.');
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const words = normalize(query).split(' ');
  return readImages(data).filter(image => !suggest || words.every(word =>
    normalize(`${image.title} ${decodeURIComponent(new URL(image.filePage).pathname)}`).split(' ').includes(word)));
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
