import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event, type EventTemplate, type Filter } from 'nostr-tools';
import { ImageSession, candidateTemplate, voteTemplate, IMAGE_MARKER, readCommonsImage, readCandidate, type CommonsImage } from '../../relay/images.js';
const secret = generateSecretKey(), otherSecret = generateSecretKey();
const key = getPublicKey(secret), otherKey = getPublicKey(otherSecret), story = 'a'.repeat(64), secondStory = 'b'.repeat(64);
const config = { pubkey: key, relays: ['wss://relay.test'] };
const photo: CommonsImage = {version: 1, url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg', filePage: 'https://commons.wikimedia.org/wiki/File:Example.jpg', title: 'Fixture', alt: 'Synthetic fixture', creator: 'Photographer', attribution: 'Credit', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/'};
const candidate = () => finalizeEvent({...candidateTemplate(story, photo), created_at: Math.floor(Date.now() / 1000) - 100}, secret);
const follow = (include: boolean, age = 100) => finalizeEvent({kind: 3, created_at: Math.floor(Date.now() / 1000) - age, tags: include ? [['p', otherKey]] : [], content: ''}, secret);
function harness(t: TestContext, cached = '[]') {
  const subscriptions: {filter: Filter; event: (event: Event) => void}[] = [];
  const values = new Map<string, string>([[`stringer-images:${key}`, cached]]);
  const storage: Storage = {get length() {return values.size;}, key: index => [...values.keys()][index] ?? null, clear: () => values.clear(), getItem: name => values.get(name) ?? null, setItem: (name, value) => {values.set(name, value);}, removeItem: name => {values.delete(name);}};
  Object.defineProperty(globalThis, 'localStorage', {value: storage, configurable: true});
  t.after(() => Reflect.deleteProperty(globalThis, 'localStorage'));
  t.mock.method(SimplePool.prototype, 'subscribeMany', (_urls: string[], filter: Filter, callbacks: {onevent: (event: Event) => void}) => {
    subscriptions.push({filter, event: callbacks.onevent});
    return {close: async () => {}};
  });
  t.mock.method(SimplePool.prototype, 'ensureRelay', () => new Promise(() => {}));
  t.mock.method(SimplePool.prototype, 'destroy', () => {});
  t.mock.method(SimplePool.prototype, 'publish', () => [Promise.resolve('acknowledged')]);
  const session = new ImageSession(config, {[story]: [], [secondStory]: []}, () => {});
  t.after(() => session.close());
  const deliver = (event: Event) => {
    for (const sub of [...subscriptions]) if (sub.filter.kinds?.includes(event.kind) &&
      (!sub.filter.authors || sub.filter.authors.includes(event.pubkey)) &&
      (!sub.filter.ids || sub.filter.ids.includes(event.id)) &&
      Object.entries(sub.filter).every(([name, values]) => !name.startsWith('#') || event.tags.some(tag => tag[0] === name.slice(1) && (values as string[]).includes(tag[1]!)))) sub.event(event);
  };
  const signer = (signingKey = secret, sign?: (template: EventTemplate) => Event | Promise<Event>) => ({getPublicKey: async () => getPublicKey(signingKey), signEvent: async (template: EventTemplate) => sign ? sign(template) : finalizeEvent(template, signingKey)});
  return {session, deliver, subscriptions, values, signer, storage};
}
test('image metadata rejects malformed roots, tag structures, URL types and metadata versions', () => {
  for (const tags of [[], [['e', story]], [['e', 'invalid', '', 'root']], [['e', story, '', 'root'], [IMAGE_MARKER]], [['e', story, '', 'root'], [IMAGE_MARKER, '{}']], [['e', story, '', 'root'], [IMAGE_MARKER, '[]']]]) {
    const event = finalizeEvent({kind: 1, created_at: Math.floor(Date.now() / 1000), content: '', tags}, secret);
    assert.throws(() => readCandidate(event, key, {[story]: [event.id]}));
  }
  for (const invalid of [{...photo, version: 2}, {...photo, url: 42}, {...photo, url: photo.url + '?token=bad'}, {...photo, url: photo.url + '#fragment'}])
    assert.throws(() => readCommonsImage(invalid));
});
test('cached trust and candidates are verified, stale votes never resurrect, and malformed caches are ignored', async t => {
  const c = candidate(), first = finalizeEvent(voteTemplate(story, c.id, Math.floor(Date.now() / 1000) - 50), otherSecret);
  const h = harness(t, JSON.stringify([first, c, follow(true)]));
  assert.equal(h.session.selection(story).winner?.id, c.id);
  assert.equal(h.session.canVote(otherKey), false, 'Cached trust alone cannot authorize signing');
  h.deliver(follow(true, 90));
  assert.equal(h.session.canVote(otherKey), true);
  h.deliver({...follow(true), sig: '0'.repeat(128)});
  h.deliver(follow(false, 95));
  h.deliver(first);
  h.deliver(finalizeEvent(voteTemplate(secondStory, null, Math.floor(Date.now() / 1000) - 40), otherSecret));
  h.deliver(finalizeEvent(voteTemplate(story, null, Math.floor(Date.now() / 1000) - 30), otherSecret));
  h.deliver(first);
  assert.equal(h.session.selection(story).winner, null);
  h.session.close(); h.deliver(c);
  assert.equal(h.session.selection(story).winner, null);
});
test('non-array and corrupt image caches do not prevent opening a session', async t => {
  const h = harness(t, '{}');
  const empty = new ImageSession(config, {}, () => {});
  assert.equal(empty.selection(story).winner, null); empty.close();
  h.values.set(`stringer-images:${key}`, 'not JSON');
  const corrupt = new ImageSession(config, {}, () => {});
  assert.equal(corrupt.selection(story).winner, null); corrupt.close();
});
test('session actions reject incorrect accounts, missing candidates, stale headlines and changed signer payloads', async t => {
  const instant = Date.now(); t.mock.method(Date, 'now', () => instant);
  const h = harness(t), c = candidate(); h.deliver(c);
  await assert.rejects(h.session.vote(h.signer(), otherKey, story, null), /eligible/);
  await assert.rejects(h.session.vote(h.signer(otherSecret), key, story, null), /eligible/);
  await assert.rejects(h.session.vote(h.signer(), key, story, 'f'.repeat(64)), /unavailable/);
  await assert.rejects(h.session.propose(h.signer(otherSecret), otherKey, story, photo), /Stringer/);
  await assert.rejects(h.session.propose(h.signer(otherSecret), key, story, photo), /Stringer/);
  await assert.rejects(h.session.propose(h.signer(), key, 'f'.repeat(64), photo), /no longer/);
  await assert.rejects(h.session.propose(h.signer(secret, template => finalizeEvent({...template, content: 'changed'}, secret)), key, story, photo), /Signer changed/);
  await assert.rejects(h.session.vote(h.signer(secret, template => finalizeEvent({...template, content: 'changed'}, secret)), key, story, null), /Signer changed/);
  h.session.refs[story] = [];
  await assert.rejects(h.session.vote(h.signer(), key, story, c.id), /unavailable/);
  await h.session.vote(h.signer(), key, story, null);
  await assert.rejects(h.session.vote(h.signer(), key, story, null), /wait a second/);
});
test('a collection or trust change during signing cannot publish a stale action', async t => {
  const h = harness(t);
  h.deliver(follow(true));
  await assert.rejects(h.session.vote(h.signer(otherSecret, template => {h.deliver(follow(false, 0)); return finalizeEvent(template, otherSecret);}), otherKey, story, null), /eligibility changed/);
  await assert.rejects(h.session.propose(h.signer(secret, template => {h.session.close(); return finalizeEvent(template, secret);}), key, story, photo), /no longer/);
  await assert.rejects(h.session.propose(h.signer(), key, story, photo), /no longer/);
});
test('closing during relay acknowledgement cannot report a published vote as successful', async t => {
  const h = harness(t);
  t.mock.method(SimplePool.prototype, 'publish', () => {h.session.close(); return [Promise.resolve('acknowledged')];});
  await assert.rejects(h.session.vote(h.signer(), key, story, null), /collection changed/);
});
test('relay failures and acknowledgement timeouts are actionable failures', async t => {
  const h = harness(t);
  t.mock.method(SimplePool.prototype, 'publish', () => [Promise.reject(new Error('Offline'))]);
  await assert.rejects(h.session.vote(h.signer(), key, story, null), /Could not publish/);
  t.mock.timers.enable({apis: ['setTimeout']});
  t.mock.method(SimplePool.prototype, 'publish', () => [new Promise(() => {})]);
  const pending = h.session.vote(h.signer(), key, story, null);
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(6001);
  await assert.rejects(pending, /Could not publish/);
});
test('large collections and follow lists use bounded relay arrays and history filter batches', async t => {
  const h = harness(t);
  const ids = Array.from({length: 161}, (_, index) => index.toString(16).padStart(64, '0'));
  const refs = Object.fromEntries(ids.map(id => [id, ids]));
  const large = new ImageSession(config, refs, () => {}, ids);
  h.deliver(finalizeEvent({kind: 3, created_at: Math.floor(Date.now() / 1000), content: '', tags: Array.from({length: 1001}, (_, i) => ['p', (i + 1000).toString(16).padStart(64, '0')])}, secret));
  assert.ok(h.subscriptions.length > 10);
  for (const {filter} of h.subscriptions) for (const value of Object.values(filter)) if (Array.isArray(value)) assert.ok(value.length <= 20);
  large.close();
});

test('untrusted or malformed live image events do not enter the session cache', t => {
  const h = harness(t), c = candidate();
  h.deliver(finalizeEvent(voteTemplate(story, c.id), otherSecret));
  h.deliver({...c, sig: '0'.repeat(128)});
  assert.equal(h.session.candidates.size, 0);
  assert.equal(h.session.selection(story).winner, null);
});
test('unavailable history relays and connections completing after disposal do not restart a session', async t => {
  const h = harness(t);
  t.mock.method(SimplePool.prototype, 'ensureRelay', async () => {throw new Error('Offline');});
  const offline = new ImageSession(config, {[story]: []}, () => {});
  await new Promise(resolve => setImmediate(resolve)); offline.close();
  let release!: (relay: unknown) => void;
  t.mock.method(SimplePool.prototype, 'ensureRelay', () => new Promise(resolve => {release = resolve;}));
  const closed = new ImageSession(config, {[story]: []}, () => {});
  closed.close(); release({}); await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed.selection(story).winner, null); h.session.close();
});

test('a disposed session ignores a cache timer that was already queued', t => {
  const original = globalThis.setTimeout;
  const queued: (() => void)[] = [];
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay?: number) => {queued.push(callback); return original(callback, delay);});
  const h = harness(t); h.deliver(candidate());
  const callback = queued.at(-1)!;
  h.session.close(); callback();
  assert.equal(h.values.get(`stringer-images:${key}`), '[]');
});

test('oversized verified image caches are removed and storage failures never interrupt the session', async t => {
  const h = harness(t);
  for (let i = 0; i < 580; i++) h.deliver(finalizeEvent(candidateTemplate(story, {...photo, title: 'Fixture '.repeat(235) + i, alt: 'A'.repeat(1900), creator: 'C'.repeat(1900), attribution: 'B'.repeat(1900)}), secret));
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(h.values.has(`stringer-images:${key}`), false, 'A verified cache exceeding 5 MB must be discarded');
  t.mock.method(h.storage, 'setItem', () => {throw new Error('Storage unavailable');});
  const small = new ImageSession(config, {[story]: []}, () => {});
  h.deliver(candidate());
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(small.candidates.size, 1); small.close();
});
