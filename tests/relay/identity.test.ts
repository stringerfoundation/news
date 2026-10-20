import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { decode } from 'nostr-tools/nip19';
import { npubEncode, nip05Endpoint, profileAddress, verifyAddress } from '../../relay/identity.js';
const key = generateSecretKey(), pubkey = getPublicKey(key), now = Math.floor(Date.now() / 1000) - 100;
const profile = (content: string, created_at = now) => finalizeEvent({ kind: 0, created_at, tags: [], content }, key);
test('connected key is displayed as a complete, round-trippable npub', () => {
  assert.deepEqual(decode(npubEncode(pubkey)), { type: 'npub', data: pubkey });
});
test('NIP-05 metadata comes from the newest verified profile for this exact key', () => {
  const old = profile(JSON.stringify({ nip05: 'old@identity.test' }));
  const latest = profile(JSON.stringify({ nip05: 'new@identity.test' }), now + 1);
  assert.equal(profileAddress([old, latest], pubkey), 'new@identity.test');
  assert.equal(profileAddress([latest], getPublicKey(generateSecretKey())), null);
  assert.equal(profileAddress([{ ...latest, sig: '0'.repeat(128) }], pubkey), null);
  assert.equal(profileAddress([old, profile('{}', now + 2)], pubkey), null);
  assert.equal(profileAddress([old, profile('bad JSON', now + 2)], pubkey), null);
  assert.equal(profileAddress([profile('{}', Math.floor(Date.now() / 1000) + 120)], pubkey), null);
});
test('NIP-05 uses HTTPS well-known endpoints and rejects credentials, ports, paths and local addresses', () => {
  assert.deepEqual(nip05Endpoint('_@Identity.test'), { url: 'https://identity.test/.well-known/nostr.json?name=_', name: '_', address: 'identity.test' });
  for (const value of ['name@localhost', 'name@127.0.0.1', 'name@example.local', 'name@identity.test/path', 'name@identity.test:443', 'a@b@identity.test', 'name@identity.test#fragment'])
    assert.equal(nip05Endpoint(value), null);
});
test('only a matching NIP-05 names entry is displayed; failures never invent an address', async () => {
  let requested = '';
  const request: typeof fetch = async (input, init) => {
    requested = String(input);
    assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit'); assert.equal(init?.referrerPolicy, 'no-referrer');
    return new Response(JSON.stringify({ names: { reporter: pubkey } }));
  };
  assert.equal(await verifyAddress('reporter@identity.test', pubkey, request), 'reporter@identity.test');
  assert.equal(requested, 'https://identity.test/.well-known/nostr.json?name=reporter');
  assert.equal(await verifyAddress('other@identity.test', pubkey, request), null);
  assert.equal(await verifyAddress('reporter@identity.test', 'f'.repeat(64), request), null);
  assert.equal(await verifyAddress('reporter@identity.test', pubkey, async () => { throw new Error('offline'); }), null);
  assert.equal(await verifyAddress('reporter@identity.test', pubkey, async () => new Response('not JSON')), null);
  assert.equal(await verifyAddress('0@identity.test', pubkey, async () => new Response(JSON.stringify({ names: [pubkey] }))), null);
});

test('invalid identity claims and non-success HTTP responses never produce a verified address', async () => {
  assert.equal(await verifyAddress('invalid', pubkey), null);
  assert.equal(await verifyAddress('reporter@identity.test', pubkey, async () => new Response('', { status: 503 })), null);
  for (const body of [null, {}, { names: null }, { names: 'invalid' }])
    assert.equal(await verifyAddress('reporter@identity.test', pubkey, async () => new Response(JSON.stringify(body))), null);
});
