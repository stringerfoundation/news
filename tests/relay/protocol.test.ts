import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { assemble, readManifest, checkedEvent } from '../../relay/protocol.js';
import { SOURCES } from '../../news-model.js';
import { publicBatch } from './fixture.js';
import type { Snapshot } from '../../relay/types.js';
function fixture() {
  const secret = generateSecretKey(), pubkey = getPublicKey(secret), time = new Date(Date.now() - 60000).toISOString();
  const snapshot: Snapshot = { schemaVersion: 2, generatedAt: time,
    sources: Object.fromEntries(SOURCES.map(source => [source.id, { stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null }])) };
  for (const source of ['bbc', 'stringer']) snapshot.sources[source] = {
    stories: [{ title: `Synthetic ${source} headline`, url: `https://example.org/${source}`, summary: 'Synthetic report', credits: 'Fictional Reporter',
      publishedAt: time, image: { url: 'https://example.org/photo.png', alt: 'Synthetic photo', credit: 'Synthetic credit' } }],
    attemptedAt: time, lastSuccessAt: time, status: 'success', error: null };
  return { secret, pubkey, ...publicBatch(snapshot, secret).batch };
}
test('signed collection preserves publisher headlines and strips publisher summaries/images', () => {
  const f = fixture(), result = assemble(f.manifest, f.events, f.pubkey);
  assert.equal(result.sources.bbc!.stories[0]!.summary, '');
  assert.equal(result.sources.bbc!.stories[0]!.image, null);
  assert.equal(result.sources.stringer!.stories[0]!.summary, 'Synthetic report');
});
test('rejects tampered signatures, wrong authors and future events', () => {
  const f = fixture();
  assert.throws(() => readManifest({ ...f.manifest, content: '{}' }, f.pubkey));
  assert.throws(() => readManifest(f.manifest, getPublicKey(generateSecretKey())));
  const future = finalizeEvent({ kind: 1, tags: [], content: '', created_at: Math.floor(Date.now() / 1000) + 3600 }, f.secret);
  assert.throws(() => checkedEvent(future, f.pubkey, 1));
});
test('missing notes cannot be reported as a complete successful collection', () => {
  const f = fixture();
  assert.throws(() => assemble(f.manifest, [f.events[0]!], f.pubkey), /Incomplete/);
  const partial = assemble(f.manifest, [f.events[0]!], f.pubkey, true);
  assert.equal(partial.sources.stringer!.status, 'failure');
  assert.equal(partial.sources.stringer!.lastSuccessAt, null);
  assert.throws(() => assemble(f.manifest, [], f.pubkey, true), /No published stories/);
});
test('signed story must match source and original HTTP(S) URL', () => {
  const f = fixture();
  const story = JSON.parse(f.events[0]!.tags.find(tag => tag[0] === 'stringer')![2]!);
  story.url = 'javascript:alert(1)';
  const bad = finalizeEvent({ ...f.events[0]!, tags: [['stringer', 'bbc', JSON.stringify(story)], ['r', story.url]] }, f.secret);
  const content = JSON.parse(f.manifest.content); content.sources.bbc.ids = [bad.id];
  const manifest = finalizeEvent({ ...f.manifest, content: JSON.stringify(content) }, f.secret);
  assert.throws(() => assemble(manifest, [bad, f.events[1]!], f.pubkey));
});
