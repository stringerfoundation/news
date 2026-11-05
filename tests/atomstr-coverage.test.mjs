import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { ATOMSTR_RELAY } from '../atomstr-config.ts';
import { cachedAtomstrSources, parseAtomstrEvent, readAtomstrSources } from '../relay/atomstr-reader.ts';

const now = Date.parse('2026-10-16T12:00:00.000Z');
const secret = generateSecretKey();
const pubkey = getPublicKey(secret);
const feed = { url: 'https://publisher.example/rss.xml', pubkey };
const source = { id: 'coverage-source', name: 'Coverage source', homepage: 'https://publisher.example', feeds: [feed] };
const event = (options = {}, key = secret, article = 'https://publisher.example/story') => finalizeEvent({
  kind: 1,
  created_at: now / 1000 - 10,
  tags: [['proxy', `${feed.url}#${encodeURIComponent(article)}`, 'rss']],
  content: 'Headline\n\nPrivate summary text',
  ...options,
}, key);

function withStorage(storage, callback) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
    clear() { storage.clear(); },
    key(index) { return [...storage.keys()][index] ?? null; },
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
  assert.equal(parseAtomstrEvent(null, source, now), null);
  for (const invalid of [
    { ...valid, kind: 0 },
    { ...valid, content: 8 },
    { ...valid, content: 'x'.repeat(50_001) },
    { ...valid, tags: Array.from({ length: 257 }, () => ['x']) },
    { ...valid, created_at: 0 },
    { ...valid, created_at: 1.25 },
    { ...valid, created_at: now / 1000 + 61 },
  ]) assert.equal(parseAtomstrEvent(invalid, source, now), null);
  assert.equal(parseAtomstrEvent({ ...valid, tags: 'not tags' }, source, now), null);

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
  const storage = new Map();
  await withStorage(storage, async () => {
    const notes = Array.from({ length: 35 }, (_, index) => event({
      created_at: now / 1000 - index,
      content: `Headline ${index}`,
    }, secret, `https://publisher.example/story-${index}`));
    notes.push(event({ content: 'Duplicate headline' }, secret, 'https://publisher.example/story-0'));
    const result = await readAtomstrSources({ sources: [source], now: () => now, previous: {}, query: async () => notes });
    assert.equal(result[source.id].status, 'success');
    assert.equal(result[source.id].stories.length, 30);
    assert.equal(result[source.id].stories[0].title, 'Headline 0');
    assert.equal(result[source.id].stories.at(-1).title, 'Headline 29');
    const cached = JSON.parse(storage.get(`stringer-atomstr-v1:${source.id}`));
    assert.equal(cached.events.length, 30);
    assert.equal(cached.events[0].content, 'Headline 0');
  });
});

test('cache accepts verified past entries and rejects missing, malformed, future, oversized, and invalid entries', async () => {
  const key = `stringer-atomstr-v1:${source.id}`;
  const storage = new Map();
  await withStorage(storage, async () => {
    assert.equal(cachedAtomstrSources([source], now)[source.id].status, 'failure');

    storage.set(key, '{broken');
    assert.equal(cachedAtomstrSources([source], now)[source.id].stories.length, 0);
    for (const cached of [
      { checkedAt: new Date(now - 1000).toISOString(), events: 'bad' },
      { checkedAt: 'invalid date', events: [event()] },
      { checkedAt: new Date(now + 1000).toISOString(), events: [event()] },
      { checkedAt: new Date(now - 1000).toISOString(), events: Array(31).fill(event()) },
      { checkedAt: new Date(now - 1000).toISOString(), events: [{ ...event(), content: 'forged' }] },
    ]) {
      storage.set(key, JSON.stringify(cached));
      assert.equal(cachedAtomstrSources([source], now)[source.id].stories.length, 0);
    }

    const checkedAt = new Date(now - 1000).toISOString();
    storage.set(key, JSON.stringify({ checkedAt, events: [event()] }));
    const usable = cachedAtomstrSources([source], now)[source.id];
    assert.equal(usable.status, 'failure');
    assert.equal(usable.stories[0].title, 'Headline');
    assert.equal(usable.lastSuccessAt, checkedAt);
    assert.match(usable.error, /previously verified/);
  });

  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'localStorage');
  try { assert.equal(cachedAtomstrSources([source], now)[source.id].status, 'failure'); }
  finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); }
});

test('query failures and empty or malformed results retain prior verified stories and still report each source', async () => {
  const storage = new Map();
  await withStorage(storage, async () => {
    const previous = { [source.id]: { stories: [{ title: 'Old', url: 'https://publisher.example/old' }], lastSuccessAt: '2026-10-15T10:00:00.000Z' } };
    for (const query of [async () => { throw new Error('offline'); }, async () => [], async () => null]) {
      const updates = [];
      const result = await readAtomstrSources({ sources: [source], previous, now: () => now, query, onUpdate: (id, state) => updates.push([id, state]) });
      assert.equal(result[source.id].status, 'failure');
      assert.equal(result[source.id].stories[0].title, 'Old');
      assert.equal(result[source.id].lastSuccessAt, previous[source.id].lastSuccessAt);
      assert.equal(updates.length, 1);
      assert.equal(updates[0][0], source.id);
    }
  });
});

test('injected query deduplicates author keys and applies the seven-day bounded filter', async () => {
  const storage = new Map();
  await withStorage(storage, async () => {
    const duplicateSource = { ...source, feeds: [feed, feed] };
    let seenFilter;
    const result = await readAtomstrSources({
      sources: [duplicateSource], previous: {}, now: () => now,
      query: async filter => { seenFilter = filter; return [event()]; },
    });
    assert.deepEqual(seenFilter, {
      kinds: [1], authors: [pubkey], since: Math.floor((now - 7 * 24 * 60 * 60 * 1000) / 1000), limit: 30,
    });
    assert.equal(result[source.id].status, 'success');
  });
});

test('default pool query uses the configured relay and always destroys the pool', async () => {
  const originalQuery = SimplePool.prototype.querySync;
  const originalDestroy = SimplePool.prototype.destroy;
  const calls = [];
  SimplePool.prototype.querySync = async function(relays, filter, options) {
    calls.push({ relays, filter, options });
    return [event()];
  };
  SimplePool.prototype.destroy = function() { calls.push({ destroyed: true }); };
  try {
    const result = await readAtomstrSources({ sources: [source], previous: {}, now: () => now });
    assert.equal(result[source.id].status, 'success');
    assert.deepEqual(calls[0].relays, [ATOMSTR_RELAY]);
    assert.equal(calls[0].options.maxWait, 8000);
    assert.equal(calls.at(-1).destroyed, true);

    calls.length = 0;
    SimplePool.prototype.querySync = async function() { throw new Error('relay unavailable'); };
    const failed = await readAtomstrSources({ sources: [source], previous: {}, now: () => now });
    assert.equal(failed[source.id].status, 'failure');
    assert.equal(calls.at(-1).destroyed, true);
  } finally {
    SimplePool.prototype.querySync = originalQuery;
    SimplePool.prototype.destroy = originalDestroy;
  }
});

test('source reads run concurrently with an eight-worker ceiling and complete each source once', async () => {
  const storage = new Map();
  await withStorage(storage, async () => {
    const sources = Array.from({ length: 11 }, (_, index) => ({
      ...source, id: `parallel-${index}`, feeds: [{ ...feed, pubkey: index === 0 ? pubkey : getPublicKey(generateSecretKey()) }],
    }));
    let active = 0, peak = 0;
    const updates = [];
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
  const originalQuery = SimplePool.prototype.querySync;
  const originalDestroy = SimplePool.prototype.destroy;
  let destroyed = false;
  SimplePool.prototype.querySync = async () => [event()];
  SimplePool.prototype.destroy = () => { destroyed = true; };
  try {
    await assert.rejects(readAtomstrSources({
      sources: [source], previous: {}, now: () => now,
      onUpdate() { throw new Error('callback failed'); },
    }), /callback failed/);
    assert.equal(destroyed, true);
  } finally {
    SimplePool.prototype.querySync = originalQuery;
    SimplePool.prototype.destroy = originalDestroy;
  }
});
