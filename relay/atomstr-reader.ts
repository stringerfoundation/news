import type { Event, Filter } from 'nostr-tools';
import type { AtomstrSource, SourceState } from './types.ts';
import { verifyEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { safeUrl, newestFirst, uniqueStories, NEWSWIRE_LIMIT } from '../news-model.ts';
import { ATOMSTR_RELAY } from '../atomstr-config.ts';

const cachePrefix = 'stringer-atomstr-v1:';
const maxAge = 7 * 24 * 60 * 60 * 1000;

// A pinned Atomstr signature and exact NIP-48 feed provenance are both required.
export function parseAtomstrEvent(event: Event, source: AtomstrSource, now = Date.now()) {
  if (!event || event.kind !== 1 || typeof event.content !== 'string' ||
      event.content.length > 50_000 || !Array.isArray(event.tags) || event.tags.length > 256 ||
      !Number.isInteger(event.created_at) || event.created_at <= 0 || event.created_at * 1000 > now + 60_000) return null;
  const feed = source.feeds.find(feed => feed.pubkey === event.pubkey);
  if (!feed || !verifyEvent(event)) return null;
  const proxies = event.tags.filter(tag => tag[0] === 'proxy');
  const proxy = proxies[0];
  if (proxies.length !== 1 || !proxy || proxy[2] !== 'rss' || !proxy[1]?.startsWith(`${feed.url}#`)) return null;
  let url;
  try { url = safeUrl(decodeURIComponent(proxy[1].slice(feed.url.length + 1).replace(/\+/g, '%20'))); }
  catch { return null; }
  const title = (event.content.split(/\r?\n/, 1)[0] ?? '').trim();
  if (!url || !title || title.length > 1000) return null;
  return { title, url, publishedAt: new Date(event.created_at * 1000).toISOString(),
    summary: '', image: null, noteId: event.id, atomstr: true,
    ...(feed.social ? { mirroredVia: feed.social } : {}) };
}

function verifiedSource(events: Event[], source: AtomstrSource, now: number) {
  const valid = events.flatMap(event => {
    const story = parseAtomstrEvent(event, source, now);
    return story ? [{ event, story }] : [];
  });
  // Prefer the publisher RSS when available; social feeds remain an explicit fallback.
  const candidates = valid.some(item => !item.story.mirroredVia)
    ? valid.filter(item => !item.story.mirroredVia) : valid;
  const stories = uniqueStories(candidates.map(item => item.story).sort(newestFirst)).slice(0, NEWSWIRE_LIMIT);
  const ids = new Set(stories.map(story => story.noteId));
  return { stories, events: candidates.filter(item => ids.has(item.event.id)).map(item => item.event) };
}
function unavailable(source: AtomstrSource, attemptedAt: string, previous?: SourceState): SourceState {
  return { stories: previous?.stories || [], attemptedAt, lastSuccessAt: previous?.lastSuccessAt || null,
    status: 'failure', error: `No verified publications available from the ${source.name} Atomstr mirror` };
}

export function cachedAtomstrSources(sources: readonly AtomstrSource[], now = Date.now()): Record<string, SourceState> {
  return Object.fromEntries(sources.map(source => {
    const attemptedAt = new Date(now).toISOString();
    try {
      const cached = JSON.parse(localStorage.getItem(cachePrefix + source.id) || 'null');
      if (!cached || !Array.isArray(cached.events) || cached.events.length > NEWSWIRE_LIMIT ||
          !Number.isFinite(Date.parse(cached.checkedAt)) || Date.parse(cached.checkedAt) > now) throw new Error('Invalid cache');
      const { stories } = verifiedSource(cached.events, source, now);
      if (!stories.length) throw new Error('No verified cached stories');
      return [source.id, { stories, attemptedAt, lastSuccessAt: cached.checkedAt,
        status: 'failure', error: 'Showing previously verified Atomstr publications while checking for updates' }];
    } catch { return [source.id, unavailable(source, attemptedAt)]; }
  }));
}

export async function readAtomstrSources({sources, onUpdate = () => {}, query,
  previous = cachedAtomstrSources(sources), now = () => Date.now()}: {sources: readonly AtomstrSource[]; onUpdate?: (id: string, entry: SourceState) => void; query?: (filter: Filter) => Promise<Event[]>; previous?: Record<string, SourceState>; now?: () => number}) {
  const pool = query ? null : new SimplePool();
  const read = query || (filter => pool!.querySync([ATOMSTR_RELAY], filter, {maxWait: 8000}));
  const result: Record<string, SourceState> = {};
  let next = 0;
  try {
    // Bounded parallel subscriptions keep the catalogue from opening one connection per source.
    await Promise.all(Array.from({length: Math.min(8, sources.length)}, async () => {
      while (next < sources.length) {
        const source = sources[next++]!;
        const attemptedAt = new Date(now()).toISOString();
        let entry: SourceState;
        try {
          const events = await read({kinds: [1], authors: [...new Set(source.feeds.map(feed => feed.pubkey))],
            since: Math.floor((now() - maxAge) / 1000), limit: NEWSWIRE_LIMIT});
          const checked = verifiedSource(events.slice(0, 200), source, now());
          if (!checked.stories.length) throw new Error('No verified publications');
          entry = {stories: checked.stories, attemptedAt, lastSuccessAt: attemptedAt, status: 'success', error: null};
          try { localStorage.setItem(cachePrefix + source.id, JSON.stringify({checkedAt: attemptedAt, events: checked.events})); }
          catch { /* Browser storage is optional. Only verified notes can be reused. */ }
        } catch { entry = unavailable(source, attemptedAt, previous[source.id]); }
        result[source.id] = entry;
        onUpdate(source.id, entry);
      }
    }));
    return result;
  } finally { pool?.destroy(); }
}
