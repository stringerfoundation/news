import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { fetchThumbnail } from '../scripts/thumbnail-bytes.ts';

const source = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/fixture.jpg';
test('thumbnail publication decodes and resizes supported raster inputs with bounded redirects', async () => {
  for (const format of ['jpeg', 'png', 'webp'] as const) {
    const pixels = await sharp({create: {width: 640, height: 320, channels: 3, background: 'skyblue'}})[format]().toBuffer();
    const bytes = await fetchThumbnail(source, async (input, init) => {
      assert.match(new Headers(init?.headers).get('User-Agent')!, /StringerNews/);
      return String(input) === source ? Response.redirect('https://example.org/thumbnail') : new Response(new Uint8Array(pixels));
    });
    const info = await sharp(bytes).metadata();
    assert.deepEqual([info.format, info.width, info.height], ['webp', 320, 160]);
  }
});
test('thumbnail failures reject empty, oversized, non-raster, corrupt and unavailable responses', async () => {
  const limit = 8 * 1024 * 1024;
  for (const make of [
    () => new Response(null),
    () => new Response('too big', {headers: {'content-length': String(limit + 1)}}),
    () => new Response(new Uint8Array(limit + 1)),
    () => new Response('no image', {status: 404}),
    () => new Response(null, {status: 301}),
    () => Response.redirect(source),
    () => Response.redirect('http://example.org/photo.png'),
    () => new Response('<svg/>'),
    () => new Response('RIFF--------'),
    () => new Response(new Uint8Array([255, 216, 255])),
  ]) await assert.rejects(fetchThumbnail(source, async () => make()));
});
