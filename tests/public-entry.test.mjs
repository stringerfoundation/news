import test from 'node:test';
import assert from 'node:assert/strict';
import * as entry from '../relay-reader.ts';
import * as implementation from '../relay/reader.ts';
import * as atomstrEntry from '../atomstr-reader.ts';
import * as atomstrImplementation from '../relay/atomstr-reader.ts';
test('public relay entry exports the verified reader and cache API', () => {
  assert.equal(entry.readRelaySnapshot, implementation.readRelaySnapshot);
  assert.equal(entry.cachedRelaySnapshot, implementation.cachedRelaySnapshot);
});
test('public mirror entry exports the verified source reader and cache API', () => {
  assert.equal(atomstrEntry.readAtomstrSources, atomstrImplementation.readAtomstrSources);
  assert.equal(atomstrEntry.cachedAtomstrSources, atomstrImplementation.cachedAtomstrSources);
});
