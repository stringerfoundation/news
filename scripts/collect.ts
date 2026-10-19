import { load } from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { VERIFIED_PUBLICATIONS } from './verified-publications.ts';
import { SOURCES, ARTICLE_IMAGE_HOSTS, CONTENT_PERMISSIONS, applyContentPermissions, NEWSWIRE_LIMIT, safeUrl, safeImageUrl, urlIdentity, uniqueStories, newestFirst, validateSnapshot } from '../news-model.ts';
import type { ContentPermissions } from '../news-model.ts';
import type { Snapshot, SourceState, Story } from '../relay/types.js';

export interface FetchTextOptions {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  attempts?: number;
  allowedHosts?: readonly string[] | null;
}
export type TextRequest = (url: string, options?: FetchTextOptions) => Promise<string>;
export interface CollectOptions {
  pagesUrl?: string;
  request?: TextRequest;
  now?: () => string;
  resetStringerBaseline?: boolean;
  stringerRefreshMs?: number;
  log?: (message: string) => void;
  permissions?: ContentPermissions;
  previousSnapshot?: unknown;
}
export interface Publication {
  publishedAt: string | null;
  publicationDate: string | null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const object = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const array = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
const records = (value: unknown) => array(value).filter(isRecord);
const imageType = (value: unknown) => typeof value === 'string' && /^image\//.test(value);
const date = (value: unknown): string | null => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
function text(html: unknown): string {
  const $ = load(String(html ?? '')); $('script,style').remove(); $('br').replaceWith(' ');
  return $.text().replace(/\s+/g, ' ').trim();
}
function feedImage(item: Record<string, unknown>): Story['image'] {
  const groups = [item, ...records(item['media:group'])];
  for (const group of groups) {
    const candidates = [
      ...records(group['media:content']).filter(media => media['@_medium'] === 'image' || imageType(media['@_type'])),
      ...records(group['media:thumbnail']),
      ...records(group.enclosure).filter(media => imageType(media['@_type'])),
    ];
    for (const media of candidates) {
      const url = safeImageUrl(media['@_url']);
      if (url) return { url, alt: text(media['media:description'] || group['media:description'] || ''), credit: text(media['media:credit'] || group['media:credit'] || '') };
    }
  }
  return null;
}
function imageStoryKey(value: unknown): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  const parsed = new URL(urlIdentity(url));
  parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';
  return parsed.href;
}
export function parseFeed(xml: string): Story[] {
  if (XMLValidator.validate(xml) !== true) throw new Error('Malformed XML feed');
  const parsed = object(new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: false, parseTagValue: false }).parse(xml) as unknown);
  const channel = object(parsed.rss).channel;
  const rdf = parsed['rdf:RDF'];
  if (!isRecord(channel) && !isRecord(rdf)) throw new Error('Expected RSS feed');
  const items = array((isRecord(channel) ? channel : object(rdf)).item);
  const stories = items.map(value => {
    const item = object(value);
    const title = text(item.title); const url = safeUrl(typeof item.link === 'string' ? item.link.trim() : '');
    if (!title || !url) throw new Error('Incomplete RSS item');
    const summary = text(item.description).slice(0, 240);
    return { title, url, summary, publishedAt: date(item.pubDate || item['dc:date']), image: feedImage(item) };
  });
  return uniqueStories(stories.sort(newestFirst)).slice(0, NEWSWIRE_LIMIT);
}
export function parseOgImage(html: string, articleUrl: string): Story['image'] {
  const $ = load(html);
  for (const selector of ['meta[property="og:image:secure_url"]', 'meta[property="og:image"]']) {
    for (const value of $(selector).map((_, el) => $(el).attr('content')).get()) {
      let url;
      try { url = safeImageUrl(new URL(value, articleUrl).href); } catch { continue; }
      if (url) return { url, alt: text($('meta[property="og:image:alt"]').first().attr('content') || ''), credit: '' };
    }
  }
  return null;
}
export async function enrichFeedImages(sourceId: string, stories: Story[], request: TextRequest): Promise<Story[]> {
  const hosts = Object.hasOwn(ARTICLE_IMAGE_HOSTS, sourceId)
    ? ARTICLE_IMAGE_HOSTS[sourceId as keyof typeof ARTICLE_IMAGE_HOSTS] : undefined;
  if (!hosts) return stories;
  const result = [...stories];
  for (let start = 0; start < stories.length; start += 4) {
    await Promise.all(stories.slice(start, start + 4).map(async (story, offset) => {
      if (story.image || !hosts.includes(new URL(story.url).hostname)) return;
      try {
        const html = await request(story.url, { attempts: 1, allowedHosts: hosts });
        result[start + offset] = { ...story, image: parseOgImage(html, story.url) };
      } catch { /* A missing or blocked article image leaves the headline available. */ }
    }));
  }
  return result;
}
export function parseStringer(html: string): Story[] {
  const $ = load(html);
  const heading = $('h1').filter((i, el) => /COURAGEOUS STORIES/i.test($(el).text()));
  if (heading.length !== 1) throw new Error('Stringer editorial heading changed');
  const section = heading.closest('section');
  if (section.length !== 1) throw new Error('Stringer editorial section missing');
  // Fail closed if even one text group no longer uses the inspected source structure.
  if (section.find('p').toArray().some(el => !$(el).closest('.text-box').length)) throw new Error('Stringer text group structure changed');
  const images = new Map<string | null, NonNullable<Story['image']>>();
  // Owner-selected image (20 September 2026); the source image anchor links
  // to a different Daraj article. Keep this explicit mapping across refreshes.
  images.set(imageStoryKey('https://unbiasthenews.org/syria-war-poisoned-soil/'), {
    url: 'https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,h=375,fit=crop/YNqM8ZwbkKHLbB3N/syria-3talawjYJe7gOOcj.png',
    alt: '', credit: '',
  });
  section.find('a img').each((index, el) => {
    const key = imageStoryKey($(el).closest('a').attr('href'));
    const url = safeImageUrl($(el).attr('src'));
    if (key && url && !images.has(key)) images.set(key, { url, alt: $(el).attr('alt') || '', credit: '' });
  });
  const boxes = section.find('.text-box').filter((i, el) => !$(el).find('h1').length && !!$(el).text().trim());
  const stories = boxes.toArray().map(el => {
    const box = $(el); const paragraphs = box.children('p');
    const credits = paragraphs.first().text().trim();
    const links = box.find('a').filter((i, a) => !!$(a).text().trim());
    if (paragraphs.length < 2 || paragraphs.first().find('a').length || links.length !== 1) throw new Error('Incomplete Stringer story group');
    const title = links.text().trim(); const url = safeUrl(links.attr('href'));
    const description = paragraphs.slice(1).clone(); description.find('a').remove(); description.find('br').replaceWith(' ');
    const summary = description.toArray().map(p => $(p).text().trim()).filter(Boolean).join(' ').trim();
    if (!credits || !title || !url || !summary) throw new Error('Incomplete Stringer story fields');
    return { title, credits, summary, url, publishedAt: null, image: images.get(imageStoryKey(url)) || null };
  });
  if (!stories.length) throw new Error('Stringer extraction returned no stories');
  return stories;
}
// Use publication metadata only; never infer dates from URLs or modification times.
export function parsePublication(html: string): Publication {
  const $ = load(html);
  const candidates: unknown[] = [];
  for (const selector of ['meta[property="article:published_time"]', 'meta[itemprop="datePublished"]', 'meta[itemprop="uploadDate"]']) {
    $(selector).each((_, el)=>{ candidates.push($(el).attr('content')); });
  }
  const entities: Record<string, unknown>[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isRecord(value)) return;
    if (array(value['@type']).some(type=>typeof type === 'string' && ['NewsArticle','Article','ReportageNewsArticle','BlogPosting','VideoObject','Book'].includes(type))) entities.push(value);
    if (value['@graph']) visit(value['@graph']);
    if (value.mainEntity) visit(value.mainEntity);
  }
  $('script[type="application/ld+json"]').each((_, el)=>{try { visit(JSON.parse($(el).text())); } catch { /* Invalid metadata is ignored. */ }});
  // Multiple article entities may describe related stories: don't guess between them.
  if (entities.length === 1) candidates.push(entities[0]!.datePublished || entities[0]!.uploadDate);
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const raw = value.trim();
    const day = raw.slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { publishedAt: null, publicationDate: day };
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
      if (/(Z|[+-]\d{2}:?\d{2})$/.test(raw) && Number.isFinite(Date.parse(raw))) return { publishedAt: new Date(raw).toISOString(), publicationDate: null };
      // A local timestamp without an offset does not establish an instant.
      if (Number.isFinite(Date.parse(raw))) return { publishedAt: null, publicationDate: day };
    }
  }
  return { publishedAt: null, publicationDate: null };
}
export async function enrichPublications(stories: Story[], previous: readonly Story[] = [], request: TextRequest = fetchText): Promise<Story[]> {
  let cursor = 0;
  const result = [...stories];
  await Promise.all(Array.from({length:4}, async()=>{
    while (cursor < stories.length) {
      const index = cursor++; const story = stories[index]!;
      let publication: Publication | undefined;
      try { publication = parsePublication(await request(story.url, {attempts:1})); } catch { /* Keep reporting available if metadata cannot be fetched. */ }
      if (!publication?.publishedAt && !publication?.publicationDate) {
        const verified = VERIFIED_PUBLICATIONS.get(story.url);
        const old = previous.find(item=>item.url === story.url && item.publicationSource === story.url);
        // A reviewed calendar date should not erase a confirmed timestamp on that date.
        // A conflicting reviewed date still takes precedence over retained metadata.
        const retainInstant = verified?.publicationDate && old?.publishedAt &&
          old.publishedAt.slice(0, 10) === verified.publicationDate;
        const fallback = retainInstant ? old : verified || old;
        publication = { publishedAt: fallback?.publishedAt || null, publicationDate: fallback?.publicationDate || null };
      }
      result[index] = { ...story, ...publication, publicationSource: publication.publishedAt || publication.publicationDate ? story.url : null };
    }
  }));
  return result;
}
export function checkBaseline(stories: Story[], previous?: readonly Story[], reset = false): Story[] {
  if (!reset && previous?.length && stories.length < previous.length * 0.75) throw new Error('Stringer count fell by over 25%; a reviewed baseline reset is required');
  return stories;
}
export async function fetchText(url: string, { fetchImpl = fetch, sleep = ms => new Promise<void>(resolve => setTimeout(resolve, ms)), attempts = 3, allowedHosts = null }: FetchTextOptions = {}): Promise<string> {
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error('Request attempts must be a positive integer');
  let error: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      let target = url;
      let response: Response | undefined;
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (allowedHosts && (!safeImageUrl(target) || !allowedHosts.includes(new URL(target).hostname))) throw new Error('Article host not configured');
        response = await fetchImpl(target, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'StringerNewsPortal/1.0', 'Accept': 'application/rss+xml, application/xml, text/html, application/json' }, cache: 'no-cache', redirect: allowedHosts ? 'manual' : 'follow' });
        if (!allowedHosts || ![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        if (redirects === 3 || !location) throw new Error('Article redirect blocked');
        target = new URL(location, target).href;
      }
      if (!response) throw new Error('Source response unavailable');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (body.length > 5_000_000) throw new Error('Source response too large');
      return body;
    } catch (failure) { error = failure; if (attempt < attempts - 1) await sleep(500 * 2 ** attempt); }
  }
  throw error;
}
export function snapshotUrl(pagesUrl: unknown): string {
  const safe = safeUrl(pagesUrl);
  if (!safe) throw new Error('PAGES_URL must be the configured GitHub Pages URL');
  const base = new URL(safe); base.hash = ''; base.search = ''; if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL('data/news.json', base).href;
}
export async function collect({ pagesUrl, request = fetchText, now = () => new Date().toISOString(), resetStringerBaseline = false, stringerRefreshMs = 86_400_000, log = console.warn, permissions = CONTENT_PERMISSIONS, previousSnapshot }: CollectOptions = {}): Promise<Snapshot> {
  let previous: Snapshot | null = null;
  try { previous = previousSnapshot === undefined ? validateSnapshot(JSON.parse(await request(snapshotUrl(pagesUrl)))) : previousSnapshot === null ? null : validateSnapshot(previousSnapshot); }
  catch (error) { log(`Previous snapshot unavailable: ${errorMessage(error)}. Every enabled source must succeed to publish.`); }
  const entries = await Promise.all(SOURCES.map(async (source): Promise<[string, SourceState]> => {
    const attemptedAt = now(); const old = previous?.sources[source.id];
    if (permissions[source.id]?.text !== true) return [source.id, { stories: [], attemptedAt, lastSuccessAt: null, status: 'paused', error: null }];
    // Retain the real attempt/success timestamps while the daily Stringer check is not due.
    // The saved snapshot makes this schedule survive worker ticks and server restarts.
    const elapsed = Date.parse(attemptedAt) - Date.parse(old?.attemptedAt || '');
    if (source.id === 'stringer' && old && old.status !== 'paused' && !resetStringerBaseline &&
        elapsed >= 0 && elapsed < stringerRefreshMs) return [source.id, old];
    try {
      const body = await request(source.url);
      const stories = source.id === 'stringer'
        ? await enrichPublications(checkBaseline(parseStringer(body), old?.stories, resetStringerBaseline), old?.stories, request)
        : permissions[source.id]?.images === true
          ? await enrichFeedImages(source.id, parseFeed(body), request)
          : parseFeed(body);
      return [source.id, { stories, attemptedAt, lastSuccessAt: attemptedAt, status: 'success', error: null }];
    } catch (error) {
      const message = errorMessage(error);
      log(`${source.name}: ${message}`);
      return [source.id, { stories: old?.stories || [], attemptedAt, lastSuccessAt: old?.lastSuccessAt || null, status: 'failure', error: message.slice(0, 250) }];
    }
  }));
  if (!previous && entries.some(([, entry]) => entry.status === 'failure')) throw new Error('Publication blocked: recovery unavailable and at least one source failed');
  return validateSnapshot(applyContentPermissions({ schemaVersion: 2, generatedAt: now(), sources: Object.fromEntries(entries) }, permissions));
}
