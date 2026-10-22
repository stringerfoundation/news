import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools';
import { IMAGE_MARKER, VOTE_MARKER, readCandidate, candidateTemplate, readVote, readFollows, selectImage, voteTemplate, newest } from '../../relay/images.js';
const owner = generateSecretKey(), a = generateSecretKey(), b = generateSecretKey();
const story = 'a'.repeat(64), other = 'b'.repeat(64), now = Math.floor(Date.now() / 1000) - 100;
const image = { version: 1, url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg', filePage: 'https://commons.wikimedia.org/wiki/File:Example.jpg', title: 'Example', alt: 'A synthetic fixture', creator: 'Example photographer', attribution: 'Example credit', license: 'CC-BY-SA-4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' };
function candidate(data = image, storyId = story) {
  return finalizeEvent({ kind: 1, created_at: now, content: 'Illustrative image', tags: [['e', storyId, '', 'root'], [IMAGE_MARKER, JSON.stringify(data)]] }, owner);
}
function vote(key: Uint8Array, id: string | null, time = now + 1, storyId = story) { return finalizeEvent(voteTemplate(storyId, id, time), key); }
const c1 = candidate(), c2 = candidate({ ...image, title: 'Other image' });
const refs = { [story]: [c1.id, c2.id] };
const candidates = [c1, c2].map(e => readCandidate(e, getPublicKey(owner), refs));
const follows = new Set([getPublicKey(a), getPublicKey(b)]);
const selection = (votes: Event[], trusted = follows) => selectImage(story, candidates, votes, trusted, refs);
test('Commons candidates require the trusted signature, manifest membership, attribution and safe source/license URLs', () => {
  assert.equal(candidates[0]?.creator, image.creator);
  assert.throws(() => readCandidate(c1, getPublicKey(a), refs));
  assert.throws(() => readCandidate(c1, getPublicKey(owner), {}));
  assert.throws(() => readCandidate({ ...c1, sig: '0'.repeat(128) }, getPublicKey(owner), refs));
  for (const data of [
    { ...image, url: 'https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg' },
    { ...image, url: 'https://upload.wikimedia.org/wikipedia/en/a.jpg' },
    { ...image, filePage: 'https://en.wikipedia.org/wiki/File:Example.jpg' },
    { ...image, creator: '' }, { ...image, licenseUrl: 'https://evil.test/license' },
    { ...image, license: 'CC-BY-NC-4.0' }, { ...image, licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
  ]) {
    const event = candidate(data);
    assert.throws(() => readCandidate(event, getPublicKey(owner), { [story]: [event.id] }));
  }
});
test('one approval enables an image; duplicates and untrusted votes do not increase its score', () => {
  const event = vote(a, c1.id);
  assert.equal(selection([]).winner, null);
  assert.equal(selection([event, event, vote(owner, c2.id)]).winner?.id, c1.id);
  assert.equal(selection([event, event]).scores[0]?.count, 1);
  assert.equal(selection([event], new Set()).winner, null);
});
test('most approvals win; ties favor earliest active approval then candidate ID', () => {
  assert.equal(selection([vote(a, c1.id), vote(b, c2.id, now + 2)]).winner?.id, c1.id);
  const sameTime = selection([vote(a, c1.id), vote(b, c2.id)]).winner?.id;
  assert.equal(sameTime, [c1.id, c2.id].sort()[0]);
  assert.equal(selection([vote(a, c2.id), vote(b, c2.id)]).winner?.id, c2.id);
});
test('latest vote changes or withdraws a choice; old votes cannot reappear after withdrawal', () => {
  const first = vote(a, c1.id), change = vote(a, c2.id, now + 2), withdraw = vote(a, null, now + 3);
  assert.equal(selection([change, first]).winner?.id, c2.id);
  assert.equal(selection([first, withdraw, change]).winner, null);
  const equal = [vote(a, c1.id), vote(a, c2.id)].sort(newest);
  assert.equal(selection(equal).winner?.id, readVote(equal[0]!, refs).candidateId);
});
test('votes reject different stories, malformed payloads and future timestamps', () => {
  for (const event of [vote(a, c1.id, now, other), vote(a, c1.id, Math.floor(Date.now() / 1000) + 120),
    finalizeEvent({ ...voteTemplate(story, c1.id, now), tags: [['e', story, '', 'root'], ['t', VOTE_MARKER], [VOTE_MARKER, 'null']] }, a)])
    assert.throws(() => readVote(event, refs));
});
test('only the configured Stringer key defines direct follows; empty lists remove trust and larger lists retain every direct follow', () => {
  const event = finalizeEvent({ kind: 3, created_at: now, content: '', tags: [['p', getPublicKey(a)], ['p', 'npub-invalid'], ['p', getPublicKey(a)]] }, owner);
  assert.deepEqual(readFollows(event, getPublicKey(owner)), new Set([getPublicKey(a)]));
  assert.throws(() => readFollows(event, getPublicKey(b)));
  const oversized = finalizeEvent({ kind: 3, created_at: now, content: '', tags: Array.from({ length: 1001 }, (_, i) => ['p', i.toString(16).padStart(64, '0')]) }, owner);
  assert.equal(readFollows(oversized, getPublicKey(owner)).size, 1001);
  assert.equal(readFollows(finalizeEvent({ kind: 3, created_at: now, content: '', tags: [] }, owner), getPublicKey(owner)).size, 0);
});

test('a latest choice of an unavailable candidate never resurrects an earlier approval', () => {
  assert.equal(selection([vote(a, c1.id), vote(a, other, now + 2)]).winner, null);
});

test('independent candidates require Stringer’s signature, discovery tag, and a current news note', () => {
  const event = finalizeEvent(candidateTemplate(story, image as Parameters<typeof candidateTemplate>[1]), owner);
  assert.equal(readCandidate(event, getPublicKey(owner), { [story]: [] }, true).id, event.id);
  assert.throws(() => readCandidate(event, getPublicKey(owner), {}, true));
  assert.throws(() => readCandidate(event, getPublicKey(a), { [story]: [] }, true));
  assert.throws(() => readCandidate(c1, getPublicKey(owner), { [story]: [] }, true));
});
