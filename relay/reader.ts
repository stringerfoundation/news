import { SimplePool } from 'nostr-tools/pool';
import type { Event, Filter } from 'nostr-tools';
import type { Snapshot } from './types.js';
import { readCachedCollection } from './cache.js';
import { assemble, readManifest, MANIFEST_KIND, MANIFEST_KEY } from './protocol.js';
export interface ReaderConfig {
  pubkey: string;
  relays: string[];
}
export interface FeedLoadTiming {
  startedAt: number;
  durationMs: number | null;
  received: number;
  total: number;
  state: 'loading' | 'loaded' | 'partial' | 'empty';
}
export async function readRelaySnapshot(config: ReaderConfig, report: (message: string) => void = () => {}, onSnapshot?: (snapshot: Snapshot) => void, onFeedTiming?: (timings: Record<string, FeedLoadTiming>) => void, options: { timeoutMs?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15_000)
    throw new Error('Invalid reader loading budget');
  const deadline = performance.now() + timeoutMs;
  const cached = readCachedCollection(config.pubkey);
  if (!/^[0-9a-f]{64}$/.test(config.pubkey) || !config.relays.length || config.relays.length > 5)
    throw new Error('Relay reader not configured');
  for (const relay of config.relays) {
    const url = new URL(relay);
    if (url.protocol !== 'wss:' || url.username || url.password) throw new Error('Invalid relay');
  }
  const pool = new SimplePool();
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A slow or silent relay must not hold up data already returned by healthy relays.
    // maxWait in nostr-tools is an EOSE timeout, not an overall request deadline.
    const query = (filter: Filter, onEvent?: (event: Event) => void) => new Promise<Event[]>((resolve) => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { resolve([]); return; }
      const events = new Map<string, Event>();
      let settled = false;
      let manifestTimer: ReturnType<typeof setTimeout> | undefined;
      const abort = new AbortController();
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(manifestTimer);
        abort.abort();
        void subscription.close();
        resolve([...events.values()]);
      };
      const timer = setTimeout(finish, Math.min(6000, remaining));
      const subscription = pool.subscribeMany(config.relays, filter, {
        maxWait: 5000,
        abort: abort.signal,
        onevent(event) {
          if (settled) return;
          if (filter.kinds?.includes(MANIFEST_KIND)) {
            try { readManifest(event, config.pubkey); } catch { return; }
            // Briefly collect competing manifests, without waiting for every relay.
            manifestTimer ??= setTimeout(finish, 600);
          }
          events.set(event.id, event);
          onEvent?.(event);
          if (filter.ids?.every(id => events.has(id))) finish();
        },
        oneose: finish,
        onclose: finish,
      });
    });
    report('Connecting to news relays…');
    const manifests = await query({
      kinds: [MANIFEST_KIND],
      authors: [config.pubkey],
      '#d': [MANIFEST_KEY],
      limit: 5,
    });
    const valid = manifests
      .filter((event) => {
        try {
          readManifest(event, config.pubkey);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
    const event = valid[0];
    if (!event) throw new Error('No valid collection');
    const manifest = readManifest(event, config.pubkey);
    if (cached && Date.parse(cached.snapshot.generatedAt) > Date.parse(manifest.generatedAt))
      throw new Error('Older collection');
    report('Verified collection. Loading published stories…');
    const ids = Object.values(manifest.sources).flatMap((source) => source.ids);
    const requestedIds = [
      ...new Set([
        ...ids,
        ...Object.values(manifest.groups === undefined ? manifest.assignments || {} : {}),
      ]),
    ];
    const stories: Event[] = [];
    const arriving = new Map<string, Event>();
    const startedAt = performance.now();
    const arrivalTimes = new Map<string, number>();
    const updateTimings = (finished = false) => {
      onFeedTiming?.(Object.fromEntries(Object.entries(manifest.sources).map(([source, entry]) => {
        const receivedIds = entry.ids.filter(id => arrivalTimes.has(id));
        const complete = receivedIds.length === entry.ids.length;
        const state = !entry.ids.length ? 'empty' : complete ? 'loaded' : finished ? 'partial' : 'loading';
        const durationMs = !entry.ids.length ? null : complete
          ? Math.max(...receivedIds.map(id => arrivalTimes.get(id)!)) - startedAt
          : finished ? performance.now() - startedAt : null;
        return [source, { startedAt, durationMs, received: receivedIds.length, total: entry.ids.length, state }];
      })));
    };
    updateTimings();
    const publishProgress = () => {
      progressTimer = undefined;
      let partial: Snapshot;
      try {
        // The manifest, signatures, source tags and outbound URLs are verified
        // by the same assembly path used for the final collection.
        partial = assemble(event, [...arriving.values()], config.pubkey, true);
      } catch { return; } // No usable verified stories yet.
      updateTimings();
      onSnapshot?.(partial);
    };
    const receive = (note: Event) => {
      arriving.set(note.id, note);
      if (!arrivalTimes.has(note.id)) arrivalTimes.set(note.id, performance.now());
      if ((onSnapshot || onFeedTiming) && progressTimer === undefined)
        progressTimer = setTimeout(publishProgress, 100);
    };
    const batches: Promise<Event[]>[] = [];
    for (let i = 0; i < requestedIds.length; i += 100)
      batches.push(query({
          ids: requestedIds.slice(i, i + 100),
          authors: [config.pubkey],
          kinds: [1],
          limit: 100,
        }, receive));
    stories.push(...(await Promise.all(batches)).flat());
    const received = new Set(stories.map((story) => story.id));
    const missing = ids.filter((id) => !received.has(id));
    // One bounded retry covers transient relay connection failures without accepting an incomplete collection.
    if (missing.length && performance.now() < deadline) {
      report(`Received ${received.size} published notes. Retrying ${missing.length} missing notes…`);
      const retries: Promise<Event[]>[] = [];
      for (let i = 0; i < missing.length; i += 100)
        retries.push(query({ ids: missing.slice(i, i + 100), authors: [config.pubkey], kinds: [1], limit: 100 }, receive));
      stories.push(...(await Promise.all(retries)).flat());
    }
    const cacheKey = `stringer-relay:${config.pubkey}`;
    // Re-read in case another tab saved a newer verified collection during the load.
    const latestCache = readCachedCollection(config.pubkey) ?? cached;
    if (latestCache && Date.parse(latestCache.snapshot.generatedAt) > Date.parse(manifest.generatedAt))
      throw new Error('Older collection');
    if (latestCache) {
      const have = new Set(stories.map(story => story.id));
      const requested = new Set(requestedIds);
      stories.push(...latestCache.stories.filter(story => requested.has(story.id) && !have.has(story.id)));
    }
    const snapshot = assemble(event, stories, config.pubkey, true);
    updateTimings(true);
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ manifest: event, stories }));
    } catch {
      /* Storage is optional. */
    }
    return snapshot;
  } finally {
    clearTimeout(progressTimer);
    pool.destroy();
  }
}
export function cachedRelaySnapshot(config: ReaderConfig) {
  return readCachedCollection(config.pubkey)?.snapshot ?? null;
}
