import type { Event, Filter } from 'nostr-tools';
import type { AbstractRelay } from 'nostr-tools/abstract-relay';
import type { AtomstrSource, SourceState } from './types.ts';
import { verifyEvent } from 'nostr-tools';
import { AbstractSimplePool } from 'nostr-tools/pool';
import { safeUrl, newestFirst, uniqueStories, NEWSWIRE_LIMIT } from '../news-model.ts';
import { ATOMSTR_RELAY, ATOMSTR_MAX_AGE_MS } from '../atomstr-config.ts';

const cachePrefix = 'stringer-atomstr-v1:';

function queryRelay(relay: AbstractRelay, filters: Filter[], timeout: number) {
  type Reply = {events: Event[]; complete: boolean; timedOut: boolean};
  return new Promise<Reply>(resolve => {
    const events: Event[] = [];
    let closed = false;
    let timedOut = false;
    const subscription = relay.subscribe(filters, {
      // The library also calls oneose on its own timeout. Our earlier deadline
      // keeps a silent relay distinct from a relay that reports an empty result.
      eoseTimeout: timeout + 1000,
      onevent(event) { if (events.length < 200) events.push(event); },
      oneose() {
        if (closed) return;
        resolve({events, complete: true, timedOut});
        subscription.close();
      },
      onclose() {
        closed = true;
        clearTimeout(timer);
        resolve({events, complete: false, timedOut});
      },
    });
    const timer = setTimeout(() => {
      timedOut = true;
      subscription.close();
    }, timeout);
  });
}

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
  const title = event.content.split(/\r?\n/, 1)[0]!.trim();
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
  previous = cachedAtomstrSources(sources), now = () => Date.now()}: {sources: readonly AtomstrSource[]; onUpdate?: (id: string, entry: SourceState) => void; query?: (filters: Filter[]) => Promise<Event[]>; previous?: Record<string, SourceState>; now?: () => number}) {
  if (!sources.length) return {};
  // Use the same verifier for transport and provenance checks so an event's
  // signature is verified once even when the catalogue delivers many results.
  const connectionTimeout = 4000;
  const pool = query ? null : new AbstractSimplePool({
    verifyEvent, websocketImplementation: WebSocket, maxWaitForConnection: connectionTimeout,
  });
  const deadline = performance.now() + 30_000;
  const connect = () => pool!.ensureRelay(ATOMSTR_RELAY, { connectionTimeout });
  const relay = pool ? connect().catch(connect) : null;
  let reconnection: Promise<AbstractRelay> | undefined;
  let relayResponded = false;
  const replaceSilentConnection = async (connection: AbstractRelay) => {
    // Let nostr-tools send the queued CLOSE frames before closing the socket.
    for (const subscription of connection.openSubs.values()) subscription.close();
    await Promise.resolve();
    pool!.close([ATOMSTR_RELAY]);
    return connect();
  };
  const readFrom = (connection: AbstractRelay, filters: Filter[]) => {
    const remaining = deadline - performance.now();
    return remaining > 0 && connection.connected
      ? queryRelay(connection, filters, Math.min(remaining, 8000))
      : {events: [], complete: false, timedOut: false};
  };
  const read = async (filters: Filter[]) => {
    if (query) return {events: await query(filters), complete: true};
    const replacementStarted = reconnection;
    const connection = await (replacementStarted ?? relay!);
    const reply = await readFrom(connection, filters);
    if (reply.complete || reply.events.length) relayResponded = true;
    const silent = reply.timedOut && !relayResponded;
    if (reply.complete || replacementStarted || performance.now() >= deadline || (connection.connected && !silent && !reconnection)) return reply;
    try {
      // Every worker on a dropped or silent socket shares one replacement.
      const replacement = await (reconnection ??= silent ? replaceSilentConnection(connection) : connect());
      const retried = await readFrom(replacement, filters);
      if (retried.complete) return retried;
      return {events: [...reply.events, ...retried.events], complete: false};
    } catch {
      return reply;
    }
  };
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
          const since = Math.floor((now() - ATOMSTR_MAX_AGE_MS) / 1000);
          // Give publisher RSS its own result limit so newer social posts
          // cannot crowd out the publisher's headlines.
          const filters = [source.feeds.filter(feed => !feed.social), source.feeds.filter(feed => feed.social)]
            .filter(feeds => feeds.length)
            .map(feeds => ({kinds: [1], authors: [...new Set(feeds.map(feed => feed.pubkey))], since, limit: NEWSWIRE_LIMIT}));
          const {events, complete} = await read(filters);
          const checked = verifiedSource(events.slice(0, 200).filter(event => event?.created_at >= since), source, now());
          if (!complete) {
            // Keep already delivered verified headlines without marking a partial reply successful.
            const old = previous[source.id];
            entry = unavailable(source, attemptedAt, old);
            entry.stories = uniqueStories([...checked.stories, ...entry.stories]).sort(newestFirst).slice(0, NEWSWIRE_LIMIT);
          } else {
            entry = {stories: checked.stories, attemptedAt, lastSuccessAt: attemptedAt, status: 'success', error: null};
            try {
              if (checked.events.length) localStorage.setItem(cachePrefix + source.id, JSON.stringify({checkedAt: attemptedAt, events: checked.events}));
              else localStorage.removeItem(cachePrefix + source.id);
            } catch { /* Browser storage is optional. Only verified notes can be reused. */ }
          }
        } catch { entry = unavailable(source, attemptedAt, previous[source.id]); }
        result[source.id] = entry;
        onUpdate(source.id, entry);
      }
    }));
    return result;
  } finally { pool?.destroy(); }
}
