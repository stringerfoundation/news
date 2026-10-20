import { searchCommons } from './commons.js';
import { readIllustration, type CommonsImage } from './images.js';

export type ImageSource = 'all' | 'commons' | 'openverse' | 'flickr' | 'eu' | 'wellcome' | 'smithsonian' | 'europeana';
export interface ImageSearchResult { images: CommonsImage[]; issues: string[] }
const sources = { commons: 'Wikimedia Commons', openverse: 'Openverse', flickr: 'Flickr via Openverse', eu: 'EU audiovisual library', wellcome: 'Wellcome Collection via Openverse', smithsonian: 'Smithsonian via Openverse', europeana: 'Europeana via Openverse' };
const euEndpoint = 'https://gfdwwnbuul.execute-api.eu-west-1.amazonaws.com/avsportal/avsportal';
function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return new DOMParser().parseFromString(value, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim().slice(0, 2000) || '';
}
async function json(url: URL, request: typeof fetch, timeout = 12000) {
  const response = await request(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(response.status === 429 ? 'Search limit reached. Please retry later.' : 'Search is unavailable. Please retry.');
  return response.json();
}
interface OpenverseImage {
  id?: string; title?: string; creator?: string; attribution?: string; url?: string; foreign_landing_url?: string;
  license?: string; license_version?: string; license_url?: string; source?: string; mature?: boolean;
}
export async function searchOpenverse(query: string, request: typeof fetch = fetch, provider: boolean | 'wellcome' | 'smithsonian' | 'europeana' = false): Promise<CommonsImage[]> {
  const url = new URL('https://api.openverse.org/v1/images/');
  let filter = provider === true ? 'flickr' : provider === 'wellcome' ? 'wellcome_collection' : provider === 'europeana' ? 'europeana' : '';
  if (provider === 'smithsonian') {
    const stats = await json(new URL('https://api.openverse.org/v1/images/stats/'), request) as { source_name?: string }[];
    if (!Array.isArray(stats)) throw new Error('Invalid provider response.');
    filter = stats.map(item => item.source_name || '').filter(name => /^smithsonian_[a-z_]+$/.test(name)).join(',');
    if (!filter) throw new Error('Smithsonian search is unavailable.');
  }
  url.search = new URLSearchParams({ q: query.trim().slice(0, 200), license: 'by,by-sa,cc0,pdm', page_size: '10', mature: 'false',
    ...(filter ? { source: filter } : { excluded_source: 'wikimedia' }) }).toString();
  const data = await json(url, request, 25000) as { results?: OpenverseImage[] };
  if (!Array.isArray(data.results)) throw new Error('Invalid image search response.');
  const images: CommonsImage[] = [];
  for (const item of data.results) {
    if (item.mature || !plain(item.source) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(item.id || '') || item.source === 'wikimedia' || (filter && !filter.split(',').includes(item.source || ''))) continue;
    const license = item.license === 'cc0' ? 'CC0-1.0' : item.license === 'pdm' ? 'PDM-1.0'
      : ['by', 'by-sa'].includes(item.license || '') ? `CC-${item.license!.toUpperCase()}-${item.license_version}` : '';
    try {
      images.push(readIllustration({ version: 1, source: 'openverse', sourceName: `${item.source?.startsWith('smithsonian_') ? 'Smithsonian' : item.source === 'wellcome_collection' ? 'Wellcome Collection' : item.source === 'europeana' ? 'Europeana' : plain(item.source)} via Openverse`,
        sourceUrl: `https://api.openverse.org/v1/images/${item.id}/`, url: item.url, filePage: item.foreign_landing_url,
        title: plain(item.title), alt: plain(item.title), creator: plain(item.creator), attribution: plain(item.attribution),
        license, licenseUrl: item.license_url }));
    } catch { /* Incomplete credits, unsupported licenses and unsafe URLs stay absent. */ }
    if (images.length >= 5) break;
  }
  return images;
}
interface EuPhoto {
  ref?: string; type?: string; titles_json?: { EN?: string }; summary_json?: { EN?: string };
  copyright_json?: { year?: string; holders?: { EN?: string[] } };
  cc_by_json?: { cc_by?: string; titles?: Record<string, unknown>; links?: Record<string, unknown> }[];
  cooperator_json?: Record<string, { EN?: { coop?: string[] } }>;
  media_json?: { LOW?: { PATH?: string }; MED?: { PATH?: string } };
}
export async function searchEuPhotos(query: string, request: typeof fetch = fetch): Promise<CommonsImage[]> {
  const url = new URL(euEndpoint);
  url.search = new URLSearchParams({ kwgg: query.trim().slice(0, 200), type: 'PHOTO', hasMedia: '1', wt: 'json', index: '1', pagesize: '10',
    fl: 'ref,type,titles_json,summary_json,copyright_json,cc_by_json,cooperator_json,media_json' }).toString();
  const data = await json(url, request) as { response?: { docs?: EuPhoto[] } };
  if (!Array.isArray(data.response?.docs)) throw new Error('Invalid EU photo search response.');
  const images: CommonsImage[] = [];
  for (const item of data.response.docs) {
    const holders = item.copyright_json?.holders?.EN, terms = item.cc_by_json;
    // The EU's CC BY 4.0 default applies to EU-owned content only. Do not infer
    // reuse rights for third-party holders or files carrying individual notices.
    if (item.type !== 'PHOTO' || !/^P-\d+\/\d+-\d+$/.test(item.ref || '') || !holders?.length ||
      !holders.every(holder => ['European Union', 'European Commission', 'Commission of the European Communities'].includes(holder)) ||
      !terms?.length || terms.some(term => term.cc_by !== '0' || Object.keys(term.titles || {}).length || Object.keys(term.links || {}).length)) continue;
    const path = item.media_json?.LOW?.PATH || item.media_json?.MED?.PATH;
    if (!path || !/^\/\d+\/\d+\/\d+\/[\w-]+\.jpg$/.test(path) || !/^\d{4}$/.test(item.copyright_json?.year || '')) continue;
    const creator = item.cooperator_json?.PHOTOGRAPHER?.EN?.coop?.map(plain).filter(Boolean).join(', ');
    if (!creator) continue;
    const page = `https://audiovisual.ec.europa.eu/en/photo/${item.ref!.replace('/', '~2F')}`;
    const agencies = item.cooperator_json?.AGENCY?.EN?.coop?.map(plain).filter(Boolean).join(', ');
    try {
      images.push(readIllustration({ version: 1, source: 'eu', sourceName: 'European Commission audiovisual library', sourceUrl: page, filePage: page,
        url: `https://ec.europa.eu/avservices/repository/photo${path}`, title: plain(item.titles_json?.EN),
        alt: plain(item.summary_json?.EN) || plain(item.titles_json?.EN), creator,
        attribution: `© European Union, ${item.copyright_json!.year}${agencies ? ` · ${agencies}` : ''}. Thumbnail display.`,
        license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' }));
    } catch { /* Missing metadata never becomes an invented permission or credit. */ }
    if (images.length >= 5) break;
  }
  return images;
}
const cache = new Map<string, { until: number; images: CommonsImage[] }>();
export async function searchImages(query: string, source: ImageSource = 'all', suggest = false, request: typeof fetch = fetch, onProgress?: (result: ImageSearchResult) => void): Promise<ImageSearchResult> {
  if (!query.trim()) throw new Error('Enter a person, place or subject to search for.');
  const issues: string[] = [];
  const completed: CommonsImage[][] = [];
  const snapshot = (): ImageSearchResult => {
    const images: CommonsImage[] = [];
    for (const image of completed.flat()) {
      if (!images.some(other => other.filePage === image.filePage || other.url === image.url)) images.push(image);
    }
    return { images: images.slice(0, 30), issues: [...issues] };
  };
  const run = async (id: Exclude<ImageSource, 'all'>) => {
    const key = JSON.stringify([id, query.trim(), suggest]), cached = cache.get(key);
    if (request === fetch && cached && cached.until > Date.now()) return cached.images;
    try {
      const images = id === 'commons' ? await searchCommons(query, request, suggest) : id === 'eu' ? await searchEuPhotos(query, request)
        : await searchOpenverse(query, request, id === 'flickr' ? true : ['wellcome', 'smithsonian', 'europeana'].includes(id) ? id as 'wellcome' | 'smithsonian' | 'europeana' : false);
      if (request === fetch) {
        if (cache.size >= 200) cache.delete(cache.keys().next().value!);
        cache.set(key, { until: Date.now() + 10 * 60 * 1000, images });
      }
      return images;
    } catch (error) {
      issues.push(`${sources[id]}: ${error instanceof Error ? error.message : 'Search is unavailable. Please retry.'}`);
      return [];
    }
  };
  const load = async (id: Exclude<ImageSource, 'all'>) => {
    completed.push(await run(id));
    onProgress?.(snapshot());
  };
  if (source !== 'all') { await load(source); return snapshot(); }
  if (suggest) {
    await load('commons');
    if (snapshot().images.length) return snapshot();
  }
  await Promise.all((suggest ? ['openverse', 'eu'] as const : ['commons', 'openverse', 'eu', 'wellcome', 'smithsonian', 'europeana'] as const).map(load));
  return snapshot();
}
