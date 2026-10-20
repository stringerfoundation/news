import test from 'node:test';
import assert from 'node:assert/strict';
import { SimplePool } from 'nostr-tools/pool';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { readRelaySnapshot, cachedRelaySnapshot } from '../relay/reader.ts';
import { MANIFEST_KIND } from '../relay/protocol.ts';
import { publicBatch } from './relay/fixture.ts';
import { SOURCES } from '../news-model.ts';
const key = generateSecretKey(),
  pubkey = getPublicKey(key),
  config = { pubkey, relays: ['wss://relay.test'] };
function fixture(count = 1, time = '2026-01-01T00:00:00.000Z') {
  const snapshot = {
    schemaVersion: 2,
    generatedAt: time,
    sources: Object.fromEntries(
      SOURCES.map(({ id }) => [
        id,
        { stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null },
      ]),
    ),
  };
  snapshot.sources.stringer = {
    stories: Array.from({ length: count }, (_, i) => ({
      title: `Story ${i}`,
      url: `https://example.org/${i}`,
      summary: 'Reporting',
      credits: 'Reporter',
      publishedAt: time,
      image: null,
    })),
    attemptedAt: time,
    lastSuccessAt: count ? time : null,
    status: count ? 'success' : 'paused',
    error: null,
  };
  return publicBatch(snapshot, key).batch;
}
function storage(t, value = null) {
  const values = new Map(
    value
      ? [
          [
            `stringer-relay:${pubkey}`,
            JSON.stringify({ ...value, stories: value.stories ?? value.events }),
          ],
        ]
      : [],
  );
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  t.after(() => {
    delete globalThis.localStorage;
  });
  return values;
}
function relay(t, batch, options = {}) {
  let queries = 0,
    destroyed = false;
  const calls = [];
  t.mock.method(SimplePool.prototype, 'destroy', () => {
    destroyed = true;
  });
  t.mock.method(SimplePool.prototype, 'subscribeMany', (_relays, filter, callbacks) => {
    calls.push(filter);
    let closed = false;
    setImmediate(() => {
      if (filter.kinds.includes(MANIFEST_KIND)) {
        for (const manifest of options.manifests ?? [batch.manifest]) callbacks.onevent(manifest);
      } else {
        queries++;
        for (const event of options.events?.(queries, filter) ??
          batch.events.filter((e) => filter.ids.includes(e.id)))
          callbacks.onevent(event);
      }
      if (!options.silent) {
        if (options.delay && !filter.kinds.includes(MANIFEST_KIND))
          setTimeout(() => {
            callbacks.oneose();
            callbacks.onclose();
          }, options.delay);
        else {
          callbacks.oneose();
          callbacks.onclose();
        }
      }
      if (closed && options.late) callbacks.onevent(batch.events[0]);
    });
    return {
      close: () => {
        closed = true;
      },
    };
  });
  return { calls, destroyed: () => destroyed };
}
test('relay configuration rejects invalid keys, counts, schemes and credentials', async () => {
  for (const value of [
    { pubkey: 'bad', relays: config.relays },
    { pubkey, relays: [] },
    { pubkey, relays: Array(6).fill('wss://relay.test') },
    { pubkey, relays: ['https://relay.test'] },
    { pubkey, relays: ['wss://u@relay.test'] },
    { pubkey, relays: ['wss://:p@relay.test'] },
    { pubkey, relays: ['bad'] },
  ])
    await assert.rejects(readRelaySnapshot(value));
});
test('reader caches verified collections, reports feed timings and ignores late events', async (t) => {
  const batch = fixture(),
    values = storage(t),
    mock = relay(t, batch, { late: true }),
    timings = [];
  const result = await readRelaySnapshot(config, undefined, undefined, (value) =>
    timings.push(value),
  );
  assert.equal(result.sources.stringer.stories.length, 1);
  assert.equal(timings.at(-1).stringer.state, 'loaded');
  assert.equal(timings[0].bbc.state, 'empty');
  assert.ok(values.has(`stringer-relay:${pubkey}`));
  assert.equal(cachedRelaySnapshot(config).sources.stringer.stories.length, 1);
  assert.ok(mock.destroyed());
});
test('reader rejects missing or invalid manifests and always destroys its pool', async (t) => {
  storage(t);
  const batch = fixture(),
    mock = relay(t, batch, { manifests: [{ ...batch.manifest, content: 'tampered' }] });
  await assert.rejects(readRelaySnapshot(config), /No valid collection/);
  assert.ok(mock.destroyed());
});
test('reader retries missing notes and fills gaps only from a verified matching cache', async (t) => {
  const batch = fixture(2);
  storage(t, batch);
  relay(t, batch, { events: () => [batch.events[0]] });
  const messages = [];
  const result = await readRelaySnapshot(config, (m) => messages.push(m));
  assert.equal(result.sources.stringer.stories.length, 2);
  assert.ok(messages.some((m) => m.includes('Retrying 1')));
});
test('reader reports partial timing and rejects unusable cached events', async (t) => {
  const batch = fixture(2);
  storage(t, { manifest: batch.manifest, stories: [] });
  relay(t, batch, { events: () => [batch.events[0]] });
  const timings = [];
  const result = await readRelaySnapshot(config, undefined, undefined, (v) => timings.push(v));
  assert.equal(result.sources.stringer.unavailable, 1);
  assert.equal(timings.at(-1).stringer.state, 'partial');
});
test('storage failures never prevent a verified collection from loading', async (t) => {
  const batch = fixture();
  storage(t);
  globalThis.localStorage.getItem = () => {
    throw Error('blocked');
  };
  globalThis.localStorage.setItem = () => {
    throw Error('blocked');
  };
  relay(t, batch);
  assert.equal(cachedRelaySnapshot(config), null);
  assert.equal((await readRelaySnapshot(config)).sources.stringer.stories.length, 1);
});
test('cache is optional and corrupt JSON is discarded', (t) => {
  const values = storage(t);
  assert.equal(cachedRelaySnapshot(config), null);
  values.set(`stringer-relay:${pubkey}`, 'bad');
  assert.equal(cachedRelaySnapshot(config), null);
});
test('older collections cannot replace a newer cached collection', async (t) => {
  const batch = fixture();
  storage(t, fixture(1, '2026-01-02T00:00:00.000Z'));
  relay(t, batch);
  await assert.rejects(readRelaySnapshot(config), /Older collection/);
});
test('empty manifests complete without story subscriptions', async (t) => {
  const batch = fixture(0);
  storage(t);
  const mock = relay(t, batch);
  assert.equal((await readRelaySnapshot(config)).sources.stringer.stories.length, 0);
  assert.equal(mock.calls.length, 1);
});
test('more than 100 story IDs use bounded batches and recover on retry', async (t) => {
  const batch = fixture(101);
  storage(t);
  const mock = relay(t, batch, {
    events: (attempt, filter) =>
      attempt <= 2 ? [] : batch.events.filter((e) => filter.ids.includes(e.id)),
  });
  assert.equal((await readRelaySnapshot(config)).sources.stringer.stories.length, 101);
  assert.ok(mock.calls.every((f) => !f.ids || f.ids.length <= 100));
});
test('legacy assignments are requested, while new inline groups need no reply fetch', async (t) => {
  const batch = fixture(),
    value = JSON.parse(batch.manifest.content);
  delete value.groups;
  value.assignments = { [batch.events[0].id]: 'a'.repeat(64) };
  batch.manifest = finalizeEvent({ ...batch.manifest, content: JSON.stringify(value) }, key);
  storage(t);
  const mock = relay(t, batch);
  await readRelaySnapshot(config);
  assert.ok(mock.calls[1].ids.includes('a'.repeat(64)));
});
test('competing manifests sort by newest creation time then stable identifier', async (t) => {
  const batch = fixture(),
    older = fixture(1, '2025-12-31T00:00:00.000Z');
  storage(t);
  relay(t, batch, { manifests: [older.manifest, batch.manifest] });
  assert.equal((await readRelaySnapshot(config)).generatedAt, '2026-01-01T00:00:00.000Z');
});
test('streamed progress exposes verified partial stories before completion', async (t) => {
  const batch = fixture(2);
  storage(t);
  relay(t, batch, { delay: 150, events: () => [batch.events[0], batch.events[0]] });
  const partials = [],
    timings = [];
  const result = await readRelaySnapshot(
    config,
    undefined,
    (value) => partials.push(value),
    (value) => timings.push(value),
  );
  assert.ok(partials.length > 0);
  assert.equal(partials[0].sources.stringer.stories.length, 1);
  assert.equal(result.sources.stringer.unavailable, 1);
  assert.ok(timings.some((value) => value.stringer.state === 'loading'));
});
test('silent relays are bounded by the manifest grace period and request deadline', async (t) => {
  const batch = fixture(2);
  storage(t);
  relay(t, batch, { silent: true, events: () => [batch.events[0]] });
  const result = await readRelaySnapshot(config);
  assert.equal(result.sources.stringer.unavailable, 1);
});
test('legacy manifests can omit all optional grouping metadata', async (t) => {
  const batch = fixture(),
    value = JSON.parse(batch.manifest.content);
  delete value.groups;
  batch.manifest = finalizeEvent({ ...batch.manifest, content: JSON.stringify(value) }, key);
  storage(t);
  relay(t, batch);
  assert.equal((await readRelaySnapshot(config)).sources.stringer.stories.length, 1);
});
test('tied manifest timestamps select the smallest event identifier', async (t) => {
  const batch = fixture(),
    value = JSON.parse(batch.manifest.content);
  value.sources.bbc.pending = 3;
  const alternate = finalizeEvent({ ...batch.manifest, content: JSON.stringify(value) }, key);
  storage(t);
  relay(t, batch, { manifests: [batch.manifest, alternate] });
  const result = await readRelaySnapshot(config);
  assert.equal(result.sources.bbc.pending, alternate.id < batch.manifest.id ? 3 : undefined);
});
test('group replies arriving before stories do not publish an unverified empty collection', async (t) => {
  const batch = fixture(),
    value = JSON.parse(batch.manifest.content);
  delete value.groups;
  const reply = finalizeEvent(
    { kind: 1, created_at: 1767225600, tags: [], content: 'Grouping reply fixture' },
    key,
  );
  value.assignments = { [batch.events[0].id]: reply.id };
  batch.manifest = finalizeEvent({ ...batch.manifest, content: JSON.stringify(value) }, key);
  storage(t);
  relay(t, batch, { delay: 150, events: (attempt) => (attempt === 1 ? [reply] : batch.events) });
  const partials = [];
  const result = await readRelaySnapshot(config, undefined, (p) => partials.push(p));
  assert.equal(result.sources.stringer.stories.length, 1);
  assert.ok(partials.every((p) => p.sources.stringer.stories.length === 1));
});
test('reader rejects invalid total load budgets', async () => {
  for (const timeoutMs of [0, -1, NaN, Infinity, 15001]) await assert.rejects(readRelaySnapshot(config, undefined, undefined, undefined, {timeoutMs}), /Invalid reader loading budget/);
});
test('an exhausted budget prevents subscription work', async t => {
  storage(t);t.mock.method(performance, 'now', (() => {let calls = 0; return () => calls++ === 0 ? 0 : 100;})());const mock=relay(t, fixture());await assert.rejects(readRelaySnapshot(config,undefined,undefined,undefined,{timeoutMs:1}), /No valid collection/);assert.equal(mock.calls.length,0);
});
test('a newer verified collection saved during loading rejects the older network response', async t => {
  const batch=fixture(), newer=fixture(1,'2026-01-02T00:00:00.000Z');const values=storage(t);relay(t,batch,{events:()=>{values.set(`stringer-relay:${pubkey}`,JSON.stringify({manifest:newer.manifest,stories:newer.events}));return batch.events;}});await assert.rejects(readRelaySnapshot(config),/Older collection/);
});
