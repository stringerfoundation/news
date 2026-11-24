import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { readIllustration, readCommonsImage, candidateTemplate, readCandidate, selectImage, voteTemplate } from '../../relay/images.js';

const image = { version: 1, source: 'openverse', sourceName: 'flickr via Openverse',
  sourceUrl: 'https://api.openverse.org/v1/images/12345678-1234-1234-1234-123456789abc/',
  url: 'https://live.staticflickr.com/1/123456789_example.jpg', filePage: 'https://www.flickr.com/photos/example/123456789',
  title: 'Example photo', alt: 'An example', creator: 'Example photographer', attribution: 'Example credit',
  license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };
test('external illustrations require catalog provenance, credits, public HTTPS URLs and supported matching licenses', () => {
  assert.equal(readIllustration(image).source, 'openverse');
  assert.throws(() => readCommonsImage(image));
  for (const change of [
    { source: 'unknown' }, { sourceUrl: 'https://api.openverse.org.evil.example/v1/images/12345678-1234-1234-1234-123456789abc/' },
    { sourceUrl: 'https://api.openverse.org/v1/images/not-a-uuid/' }, { creator: '' }, { sourceName: '' },
    { url: 'http://images.example.org/a.jpg' }, { url: 'https://localhost./a.jpg' }, { url: 'https://127.0.0.1/a.jpg' },
    { url: 'https://[::1]/a.jpg' }, { url: 'https://192.168.1.5/a.jpg' }, { url: 'https://printer.local/a.jpg' },
    { filePage: 'javascript:alert(1)' }, { url: 'https://user:password@images.example.org/a.jpg' },
    { license: 'CC-BY-NC-4.0' }, { license: 'CC-BY-ND-4.0' }, { licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  ]) assert.throws(() => readIllustration({ ...image, ...change }), JSON.stringify(change));
});
test('EU images require the official photo page and image host, with CC BY 4.0', () => {
  const eu = { ...image, source: 'eu', sourceName: 'European Commission audiovisual library',
    sourceUrl: 'https://audiovisual.ec.europa.eu/en/photo/P-123456~2F00-01', filePage: 'https://audiovisual.ec.europa.eu/en/photo/P-123456~2F00-01',
    url: 'https://ec.europa.eu/avservices/repository/photo/01/02/03/P-123456_00-01.jpg' };
  assert.equal(readIllustration(eu).source, 'eu');
  for (const change of [{ url: image.url }, { filePage: image.filePage }, { sourceUrl: image.sourceUrl },
    { license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' }]) assert.throws(() => readIllustration({ ...eu, ...change }));
});
test('new-source candidates remain invisible publicly until a trusted signed approval', () => {
  const key = generateSecretKey(), pubkey = getPublicKey(key), story = 'a'.repeat(64);
  const event = finalizeEvent(candidateTemplate(story, readIllustration(image)), key), refs = { [story]: [event.id] };
  const candidate = readCandidate(event, pubkey, refs);
  assert.equal(selectImage(story, [candidate], [], new Set([pubkey]), refs).winner, null);
  const vote = finalizeEvent(voteTemplate(story, event.id), key);
  assert.equal(selectImage(story, [candidate], [vote], new Set(), refs).winner, null);
  assert.equal(selectImage(story, [candidate], [vote], new Set([pubkey]), refs).winner?.sourceUrl, image.sourceUrl);
  assert.throws(() => readCandidate(event, getPublicKey(generateSecretKey()), refs));
});
