
import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event, type EventTemplate } from 'nostr-tools';
import { AbstractSimplePool } from 'nostr-tools/pool';
import { ATOMSTR_RELAY } from '../atomstr-config.ts';
import { cachedAtomstrSources, parseAtomstrEvent, readAtomstrSources } from '../relay/atomstr-reader.ts';

const now = Date.parse('2026-10-16T12:00:00.000Z');
const secret = generateSecretKey();
const pubkey = getPublicKey(secret);
const feed = { url: 'https://publisher.example/rss.xml', pubkey };
const source = { id: 'coverage-source', name: 'Coverage source', homepage: 'https://publisher.example', feeds: [feed] };
const event = (options: Partial<EventTemplate> = {}, key = secret, article = 'https://publisher.example/story') => finalizeEvent({
  kind: 1,
  created_at: now / 1000 - 10,
  tags: [['proxy', `${feed.url}#${encodeURIComponent(article)}`, 'rss']],
  content: 'Headline\n\nPrivate summary text',
  ...options,
}, key);

type Relay = Awaited<ReturnType<typeof AbstractSimplePool.prototype.ensureRelay>>;
type RelayHandlers = Parameters<Relay['subscribe']>[1];

function mockRelay(reply: (handlers: RelayHandlers) => void) {
  const relay = {
    connected: true,
    subscribe(_filters: unknown, handlers: RelayHandlers) {
      queueMicrotask(() => reply(handlers));
      return { close() { handlers.onclose?.('closed by caller'); } };
    },
  };
  return relay as unknown as Relay & {connected: boolean};
}

function withStorage(storage: Map<string, string>, callback: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory: Storage = {
    getItem(key: string) { return storage.get(key) ?? null; },
    setItem(key: string, value: string) { storage.set(key, value); },
    removeItem(key: string) { storage.delete(key); },
    clear() { storage.clear(); },
    key(index: number) { return [...storage.keys()][index] ?? null; },
    get length() { return storage.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memory });
  return Promise.resolve().then(callback).finally(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
}

test('Atomstr parser rejects malformed envelopes, signatures, provenance, URLs, and headlines', () => {
  const valid = event();
  // Relay payloads can violate the TypeScript event contract.
  const parseInvalid = (input: unknown) => parseAtomstrEvent(input as Event, source, now);
  assert.equal(parseInvalid(null), null);
  for (const invalid of [
    { ...valid, kind: 0 },
    { ...valid, content: 8 },
    { ...valid, content: 'x'.repeat(50_001) },
    { ...valid, tags: Array.from({ length: 257 }, () => ['x']) },
    { ...valid, created_at: 0 },
    { ...valid, created_at: 1.25 },
    { ...valid, created_at: now / 1000 + 61 },
  ]) assert.equal(parseInvalid(invalid), null);
  assert.equal(parseInvalid({ ...valid, tags: 'not tags' }), null);

  assert.equal(parseAtomstrEvent(event({}, generateSecretKey()), source, now), null);
  assert.equal(parseAtomstrEvent(valid, { ...source, feeds: [] }, now), null);
  const forged = { ...JSON.parse(JSON.stringify(valid)), content: 'Tampered' };
  assert.equal(parseAtomstrEvent(forged, source, now), null);
  for (const tags of [
    [],
    [['proxy', `${feed.url}#https%3A%2F%2Fpublisher.example%2Fstory`, 'rss'], ['proxy', `${feed.url}#https%3A%2F%2Fpublisher.example%2Fother`, 'rss']],
    [['proxy', `${feed.url}#https%3A%2F%2Fpublisher.example%2Fstory`, 'other']],
    [['proxy', `https://wrong.example/feed#https%3A%2F%2Fpublisher.example%2Fstory`, 'rss']],
    [['proxy', `${feed.url}#javascript%3Aalert(1)`, 'rss']],
    [['proxy', `${feed.url}#%invalid`, 'rss']],
  ]) assert.equal(parseAtomstrEvent(event({ tags }), source, now), null);
  assert.equal(parseAtomstrEvent(event({ content: '\nNo headline' }), source, now), null);
  assert.equal(parseAtomstrEvent(event({ content: 'x'.repeat(1001) }), source, now), null);

  const socialKey = generateSecretKey();
  const socialFeed = { url: 'https://social.example/feed', pubkey: getPublicKey(socialKey), social: 'Bluesky' };
  const socialSource = { ...source, feeds: [socialFeed] };
  const socialEvent = finalizeEvent({
    kind: 1, created_at: now / 1000 - 1,
    tags: [['proxy', `${socialFeed.url}#https%3A%2F%2Fsocial.example%2Fpost`, 'rss']], content: 'Social headline',
  }, socialKey);
  assert.equal(parseAtomstrEvent(socialEvent, socialSource, now)?.mirroredVia, 'Bluesky');
});

test('verified stories sort newest first, deduplicate URLs, cap output, and cache only selected events', async () => {
  const storage = new Map<string, string>();
  await withStorage(storage, async () => {
    const notes = Array.from({ length: 35 }, (_, index) => event({
      created_at: now / 1000 - index,
      content: `Headline ${index}`,
    }, secret, `https://publisher.example/story-${index}`));
    notes.push(event({ content: 'Duplicate headline' }, secret, 'https://publisher.example/story-0'));
    const result = await readAtomstrSources({ sources: [source], now: () => now, previous: {}, query: async () => notes });
    assert.equal(result[source.id]!.status, 'success');
    assert.equal(result[source.id]!.stories.length, 30);
    assert.equal(result[source.id]!.stories[0]!.title, 'Headline 0');
    assert.equal(result[source.id]!.stories.at(-1)!.title, 'Headline 29');
    const cached = JSON.parse(storage.get(`stringer-atomstr-v1:${source.id}`)!);
    assert.equal(cached.events.length, 30);
    assert.equal(cached.events[0].content, 'Headline 0');
  });
});

test('cache accepts verified past entries and rejects missing, malformed, future, oversized, and invalid entries', async () => {
  const key = `stringer-atomstr-v1:${source.id}`;
  const storage = new Map<string, string>();
  await withStorage(storage, async () => {
    assert.equal(cachedAtomstrSources([source], now)[source.id]!.status, 'failure');

    storage.set(key, '{broken');
    assert.equal(cachedAtomstrSources([source], now)[source.id]!.stories.length, 0);
    for (const cached of [
      { checkedAt: new Date(now - 1000).toISOString(), events: 'bad' },
      { checkedAt: 'invalid date', events: [event()] },
      { checkedAt: new Date(now + 1000).toISOString(), events: [event()] },
      { checkedAt: new Date(now - 1000).toISOString(), events: Array(31).fill(event()) },
      { checkedAt: new Date(now - 1000).toISOString(), events: [{ ...event(), content: 'forged' }] },
    ]) {
      storage.set(key, JSON.stringify(cached));
      assert.equal(cachedAtomstrSources([source], now)[source.id]!.stories.length, 0);
    }

    const checkedAt = new Date(now - 1000).toISOString();
    storage.set(key, JSON.stringify({ checkedAt, events: [event()] }));
    const usable = cachedAtomstrSources([source], now)[source.id]!;
    assert.equal(usable.status, 'failure');
    assert.equal(usable.stories[0]!.title, 'Headline');
    assert.equal(usable.lastSuccessAt, checkedAt);
    assert.match(usable.error ?? '', /previously verified/);
  });

  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'localStorage');
  try { assert.equal(cachedAtomstrSources([source], now)[source.id]!.status, 'failure'); }
  finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); }
});

test('query failures and malformed results retain prior verified stories and still report each source', async () => {
  const storage = new Map<string, string>();
  await withStorage(storage, async () => {
    const lastSuccessAt = '2026-10-15T10:00:00.000Z';
    const previous = { [source.id]: {
      stories: [{ title: 'Old', url: 'https://publisher.example/old', summary: '', image: null, publishedAt: null }],
      lastSuccessAt, attemptedAt: lastSuccessAt, status: 'success' as const, error: null,
    } };
    for (const query of [async () => { throw new Error('offline'); }, async () => null as unknown as Event[]]) {
      const updates: [string, unknown][] = [];
      const result = await readAtomstrSources({ sources: [source], previous, now: () => now, query, onUpdate: (id, state) => updates.push([id, state]) });
      assert.equal(result[source.id]!.status, 'failure');
      assert.equal(result[source.id]!.stories[0]!.title, 'Old');
      assert.equal(result[source.id]!.lastSuccessAt, previous[source.id]!.lastSuccessAt);
      assert.equal(updates.length, 1);
      assert.equal(updates[0]![0], source.id);
    }
    const empty = await readAtomstrSources({ sources: [source], previous, now: () => now, query: async () => [] });
    assert.equal(empty[source.id]!.status, 'success');
    assert.deepEqual(empty[source.id]!.stories, []);
  });
});

test('query separates publisher and social limits, deduplicates keys, and keeps the seven-day window', async () => {
  const storage = new Map<string, string>();
  await withStorage(storage, async () => {
    const social = { url: 'https://social.example/feed', pubkey: getPublicKey(generateSecretKey()), social: 'Bluesky' };
    const duplicateSource = { ...source, feeds: [feed, feed, social] };
    let seenFilter;
    const result = await readAtomstrSources({
      sources: [duplicateSource], previous: {}, now: () => now,
      query: async filter => { seenFilter = filter; return [event()]; },
    });
    const since = Math.floor((now - 7 * 24 * 60 * 60 * 1000) / 1000);
    assert.deepEqual(seenFilter, [
      { kinds: [1], authors: [pubkey], since, limit: 30 },
      { kinds: [1], authors: [social.pubkey], since, limit: 30 },
    ]);
    assert.equal(result[source.id]!.status, 'success');
  });
});

test('empty relay replies succeed, partial replies keep verified headlines, and silent connections time out', async context => {
  const originalConnect = AbstractSimplePool.prototype.ensureRelay;
  const originalDestroy = AbstractSimplePool.prototype.destroy;
  const calls: string[] = [];
  let reply = 'empty';
  let otherSubscriptionsClosed = 0;
  AbstractSimplePool.prototype.ensureRelay = async function(url) {
    calls.push(url);
    return {
      connected: true,
      openSubs: new Map([['other', {close() { otherSubscriptionsClosed++; }}]]),
      subscribe(_filters: unknown, handlers: {oneose(): void; onclose(reason: string): void; onevent(note: Event): void}) {
        if (reply === 'empty') queueMicrotask(() => handlers.oneose());
        if (reply === 'partial') queueMicrotask(() => {
          handlers.onevent(event());
          handlers.onclose('connection dropped');
        });
        return {
          close() {
            handlers.onclose('closed by caller');
            // nostr-tools can emit a synthetic EOSE after a subscription closes.
            if (reply === 'silent') handlers.oneose();
          },
        };
      },
    } as Awaited<ReturnType<typeof originalConnect>>;
  };
  AbstractSimplePool.prototype.destroy = function() { calls.push('destroyed'); };
  try {
    const result = await readAtomstrSources({ sources: [source], previous: {}, now: () => now });
    assert.equal(result[source.id]!.status, 'success');
    assert.deepEqual(result[source.id]!.stories, []);
    assert.deepEqual(calls, [ATOMSTR_RELAY, 'destroyed']);

    reply = 'partial';
    const partial = await readAtomstrSources({ sources: [source], previous: {}, now: () => now });
    assert.equal(partial[source.id]!.status, 'failure');
    assert.equal(partial[source.id]!.lastSuccessAt, null);
    assert.equal(partial[source.id]!.stories[0]!.title, 'Headline');

    reply = 'silent';
    calls.length = 0;
    context.mock.timers.enable({apis: ['setTimeout']});
    const pending = readAtomstrSources({ sources: [source], previous: {}, now: () => now });
    await new Promise<void>(resolve => setImmediate(resolve));
    context.mock.timers.tick(8000);
    await new Promise<void>(resolve => setImmediate(resolve));
    context.mock.timers.tick(8000);
    assert.equal((await pending)[source.id]!.status, 'failure');
    assert.deepEqual(calls, [ATOMSTR_RELAY, ATOMSTR_RELAY, 'destroyed']);
    assert.equal(otherSubscriptionsClosed, 1);
    context.mock.timers.reset();

    calls.length = 0;
    AbstractSimplePool.prototype.ensureRelay = async function(url) {
      calls.push(url);
      throw new Error('relay unavailable');
    };
    const failed = await readAtomstrSources({ sources: [source], previous: {}, now: () => now });
    assert.equal(failed[source.id]!.status, 'failure');
    assert.deepEqual(calls, [ATOMSTR_RELAY, ATOMSTR_RELAY, 'destroyed']);
  } finally {
    AbstractSimplePool.prototype.ensureRelay = originalConnect;
    AbstractSimplePool.prototype.destroy = originalDestroy;
  }
});

test('workers share one replacement socket after a disconnect', async context => {
  let calls = 0;
  let requests = 0;
  const note = event();
  const dropped = mockRelay(handlers => {
    dropped.connected = false;
    handlers.onclose?.('connection dropped');
  });
  const replacement = mockRelay(handlers => {
    requests++;
    handlers.onevent?.(note);
    handlers.oneose?.();
  });
  context.mock.method(AbstractSimplePool.prototype, 'ensureRelay', async () => ++calls === 1 ? dropped : replacement);
  const sources = Array.from({length: 9}, (_, index) => ({...source, id: `reconnect-${index}`}));
  const storage = new Map<string, string>();
  await withStorage(storage, async () => {
    const result = await readAtomstrSources({sources, previous: {}, now: () => now});
    assert.equal(calls, 2);
    assert.equal(requests, sources.length);
    for (const {id} of sources) {
      assert.equal(result[id]!.status, 'success');
      assert.equal(result[id]!.stories[0]!.noteId, note.id);
      assert.ok(storage.has(`stringer-atomstr-v1:${id}`));
    }
  });
});

test('an unsuccessful replacement keeps verified partial headlines and the previous cache', async context => {
  let calls = 0;
  let failure = 'connection';
  const newNote = event({content: 'New headline'}, secret, 'https://publisher.example/new');
  const additionalNote = event({content: 'Additional headline', created_at: now / 1000 - 5}, secret, 'https://publisher.example/additional');
  const oldNote = event({content: 'Old headline', created_at: now / 1000 - 60}, secret, 'https://publisher.example/old');
  const dropped = mockRelay(handlers => {
    handlers.onevent?.(newNote);
    dropped.connected = false;
    handlers.onclose?.('first connection dropped');
  });
  const replacement = mockRelay(handlers => {
    handlers.onevent?.(additionalNote);
    handlers.onevent?.(newNote);
    handlers.onclose?.('replacement reply was incomplete');
  });
  context.mock.method(AbstractSimplePool.prototype, 'ensureRelay', async () => {
    calls++;
    if (calls === 1) {
      dropped.connected = true;
      return dropped;
    }
    if (failure === 'connection') throw new Error('replacement did not connect');
    return replacement;
  });
  const key = `stringer-atomstr-v1:${source.id}`;
  const lastSuccessAt = new Date(now - 30_000).toISOString();
  const cached = JSON.stringify({checkedAt: lastSuccessAt, events: [oldNote]});
  const storage = new Map([[key, cached]]);
  await withStorage(storage, async () => {
    for (const expected of [['New headline', 'Old headline'], ['Additional headline', 'New headline', 'Old headline']]) {
      calls = 0;
      const previous = cachedAtomstrSources([source], now);
      const result = await readAtomstrSources({sources: [source], previous, now: () => now});
      const entry = result[source.id]!;
      assert.equal(calls, 2);
      assert.equal(entry.status, 'failure');
      assert.equal(entry.lastSuccessAt, lastSuccessAt);
      assert.deepEqual(entry.stories.map(story => story.title), expected);
      assert.equal(storage.get(key), cached);
      failure = 'subscription';
    }
  });
});

test('an empty catalogue makes no connection and an expired load starts no more requests', async context => {
  let elapsed = 0;
  let calls = 0;
  let requests = 0;
  context.mock.method(performance, 'now', () => elapsed);
  const expired = mockRelay(handlers => {
    requests++;
    elapsed = 60_000;
    expired.connected = false;
    handlers.onclose?.('connection dropped at the deadline');
  });
  context.mock.method(AbstractSimplePool.prototype, 'ensureRelay', async () => {
    calls++;
    return expired;
  });
  assert.deepEqual(await readAtomstrSources({sources: [], previous: {}, now: () => now}), {});
  assert.equal(calls, 0);

  const sources = Array.from({length: 9}, (_, index) => ({...source, id: `deadline-${index}`}));
  const result = await readAtomstrSources({sources, previous: {}, now: () => now});
  assert.equal(calls, 1);
  assert.equal(requests, 8);
  assert.deepEqual(Object.values(result).map(entry => entry.status), Array(9).fill('failure'));
});

test('source reads run concurrently with an eight-worker ceiling and complete each source once', async () => {
  const storage = new Map<string, string>();
  await withStorage(storage, async () => {
    const sources = Array.from({ length: 11 }, (_, index) => ({
      ...source, id: `parallel-${index}`, feeds: [{ ...feed, pubkey: index === 0 ? pubkey : getPublicKey(generateSecretKey()) }],
    }));
    let active = 0, peak = 0;
    const updates: string[] = [];
    const result = await readAtomstrSources({
      sources, previous: {}, now: () => now,
      query: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
        return [event()];
      },
      onUpdate: id => updates.push(id),
    });
    assert.equal(peak, 8);
    assert.equal(updates.length, sources.length);
    assert.equal(new Set(updates).size, sources.length);
    assert.equal(Object.keys(result).length, sources.length);
  });
});

test('pool cleanup runs if an update callback throws', async () => {
  const originalConnect = AbstractSimplePool.prototype.ensureRelay;
  const originalDestroy = AbstractSimplePool.prototype.destroy;
  let destroyed = false;
  AbstractSimplePool.prototype.ensureRelay = async () => { throw new Error('relay unavailable'); };
  AbstractSimplePool.prototype.destroy = () => { destroyed = true; };
  try {
    await assert.rejects(readAtomstrSources({
      sources: [source], previous: {}, now: () => now,
      onUpdate() { throw new Error('callback failed'); },
    }), /callback failed/);
    assert.equal(destroyed, true);
  } finally {
    AbstractSimplePool.prototype.ensureRelay = originalConnect;
    AbstractSimplePool.prototype.destroy = originalDestroy;
  }
});
