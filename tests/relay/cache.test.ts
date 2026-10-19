import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { parseCachedCollection, readCachedCollection } from '../../relay/cache.js';
import { publicBatch } from './fixture.js';
import { SOURCES } from '../../news-model.js';

function fixture() {
  const key = generateSecretKey(), pubkey = getPublicKey(key);
  const time = new Date(Date.now() - 60_000).toISOString();
  const { batch } = publicBatch({ schemaVersion: 2, generatedAt: time, sources: Object.fromEntries(
    SOURCES.map(source => [source.id, { stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null }]),
  ) }, key);
  return { ...batch, pubkey };
}

test('only verified cached collections supply snapshot dates', () => {
  const f = fixture();
  const raw = JSON.stringify({ manifest: f.manifest, stories: f.events });
  assert.equal(parseCachedCollection(raw, f.pubkey)?.snapshot.generatedAt, JSON.parse(f.manifest.content).generatedAt);
  assert.equal(parseCachedCollection(raw, getPublicKey(generateSecretKey())), null);
  const content = JSON.parse(f.manifest.content);
  content.generatedAt = '2099-01-01T00:00:00.000Z';
  assert.equal(parseCachedCollection(JSON.stringify({ manifest: { ...f.manifest, content: JSON.stringify(content) }, stories: f.events }), f.pubkey), null);
});

test('malformed and oversized caches are ignored, including when storage is unavailable', () => {
  const f = fixture();
  for (const raw of [null, '{', 'null', '[]', '{}', JSON.stringify({ manifest: f.manifest, stories: [null] }),
    JSON.stringify({ manifest: f.manifest, stories: Array(701).fill(f.manifest) }), ' '.repeat(5_000_001)])
    assert.equal(parseCachedCollection(raw, f.pubkey), null);
  assert.equal(readCachedCollection(f.pubkey), null);
});
