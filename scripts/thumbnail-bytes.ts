import sharp from 'sharp';
import { publicFetch } from './public-fetch.ts';

const maxBytes = 8 * 1024 * 1024;
const userAgent = 'StringerNews/1.0 (+https://stringerjournalism.org/)';

export async function fetchThumbnail(source: string, request = publicFetch): Promise<Buffer> {
  const signal = AbortSignal.timeout(10_000);
  let url = new URL(source);
  for (let redirects = 0; ; redirects++) {
    if (url.protocol !== 'https:') throw new Error('Thumbnail requires HTTPS');
    const response = await request(url, {signal, redirect: 'manual', headers: {
      'User-Agent': userAgent, Accept: 'image/webp,image/jpeg,image/png',
    }});
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (redirects < 3 && [301, 302, 303, 307, 308].includes(response.status) && location) {
        url = new URL(location, url);
        continue;
      }
      throw new Error('Thumbnail unavailable or too large');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Thumbnail exceeds size limit');
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const raster = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ||
      bytes.subarray(0, 3).toString('hex') === 'ffd8ff' ||
      (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!raster) throw new Error('Unsupported thumbnail format');
    return sharp(bytes, {limitInputPixels: 32_000_000}).rotate()
      .resize({width: 320, height: 320, fit: 'inside', withoutEnlargement: true})
      .webp({quality: 76}).toBuffer();
  }
}
