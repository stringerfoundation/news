import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationFallback } from '../publications.ts';
import { STRINGER_MEDIA } from '../stringer-media.ts';

test('reviewed dates preserve confirmed same-day instants and override conflicting retained dates', () => {
  const url = 'https://www.youtube.com/watch?v=fyGdDKA097E';
  assert.equal(publicationFallback(url).publishedAt, '2025-07-22T12:01:21.000Z');
  const dated = 'https://unbiasthenews.org/syria-war-poisoned-soil/';
  assert.equal(publicationFallback(dated, { publishedAt: '2022-03-23T13:33:39.000Z' }).publishedAt, '2022-03-23T13:33:39.000Z');
  assert.deepEqual(publicationFallback(dated, { publishedAt: '2022-03-24T13:33:39.000Z' }), { publishedAt: null, publicationDate: '2022-03-23' });
  assert.deepEqual(publicationFallback('https://example.org/unknown'), { publishedAt: null, publicationDate: null });
});

test('browser media and collector share reviewed fallback dates for exact URLs', () => {
  for (const [url, media] of STRINGER_MEDIA) {
    const { image: _image, ...publication } = media;
    assert.deepEqual(publication, publicationFallback(url));
  }
  const reel = 'https://www.instagram.com/reel/DMsRo8JNRY8/?igsh=MWc5aXJiZml4c2l4cA==';
  assert.deepEqual(publicationFallback(reel), { publishedAt: null, publicationDate: '2025-07-29' });
  assert.deepEqual(publicationFallback(reel.split('?')[0]!), { publishedAt: null, publicationDate: null });
});
