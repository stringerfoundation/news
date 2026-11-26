import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/browser.ts';
import { SOURCES } from '../news-model.ts';
import { EDITION_SOURCES } from '../edition-sources.ts';
import { isPublicAsset } from '../public-assets.ts';
import sharp from 'sharp';

test('public editions read CDN files on first load, refresh and outage without relay sockets', async t => {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const at = new Date().toISOString();
  const id = 'a'.repeat(64);
  const group = 'b'.repeat(64);
  const photo = {version: 1, title: 'Fixture', alt: 'Illustration', creator: 'Creator', attribution: 'Credit',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg',
    filePage: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
    license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'};
  const webp = await sharp({create: {width: 2, height: 2, channels: 3, background: 'skyblue'}}).webp().toBuffer();
  for (const path of ['', 'fr', 'sw']) {
    const page = await browser.newPage();
    await page.clock.install();
    const sockets: string[] = [], files: string[] = [], externalSearches: string[] = [];
    let version = 1;
    let offline = false;
    let olderSnapshot = false;
    await page.routeWebSocket('**/*', socket => { sockets.push(socket.url()); socket.close(); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.href === photo.url) return route.fulfill({contentType: 'image/png', body: await readFile('assets/favicon-16.png')});
      if (url.hostname !== 'reader.test') {
        if (['api.openverse.org', 'commons.wikimedia.org', 'gfdwwnbuul.execute-api.eu-west-1.amazonaws.com'].includes(url.hostname)) externalSearches.push(url.href);
        return route.abort();
      }
      const file = url.pathname.slice(1);
      if (file.endsWith('.json')) {
        files.push(file);
        if (offline) return route.fulfill({status: 503});
        const entry = (name: string) => ({
          attemptedAt: at, lastSuccessAt: at, status: 'success', error: null,
          stories: [{title: name + version, url: 'https://example.org/' + name, summary: 'Reporting', credits: 'Reporter',
            publishedAt: at, image: null, noteId: id, clusterId: group}],
        });
        const thumbnailPath = `assets/headline-thumbnails/${String(version).padStart(64, '0')}.webp`;
        const thumbnail = {file: thumbnailPath, image: photo, suggested: false};
        if (file === 'data/news.json') return route.fulfill({json: {
          generatedAt: olderSnapshot ? new Date(Date.parse(at) - 1000).toISOString() : at, schemaVersion: 2, sources: Object.fromEntries(SOURCES.map(source => [source.id, entry(source.id)])),
          illustrations: {[id]: photo, invalid: {}},
          thumbnails: Object.fromEntries(SOURCES.map((source, index) => [`https://example.org/${source.id}`, index === 0 ? thumbnail : null]).concat([['https://example.org/invalid', {file: '../outside.webp', image: photo, suggested: false}]])),
        }});
        const publisher = path === 'sw' ? 'dw' : EDITION_SOURCES.fr![0]!.id;
        return route.fulfill({json: {generatedAt: at, sources: {[publisher]: entry(publisher)}, thumbnails: {[`https://example.org/${publisher}`]: thumbnail}}});
      }
      if (!file || file.endsWith('/')) return route.fulfill({contentType: 'text/html', body: await readFile(`_site/${file}index.html`)});
      if (!isPublicAsset(file)) return route.abort();
      if (file.startsWith('assets/headline-thumbnails/')) return route.fulfill({contentType: 'image/webp', body: webp});
      return route.fulfill({contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'image/png', body: await readFile('_site/' + file)});
    });
    await page.goto('https://reader.test/' + (path ? path + '/' : ''));
    const ready = () => page.locator('#stringer-news[aria-busy="false"] article').first().waitFor();
    await ready();
    assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer1');
    assert.ok(await page.locator('#world-news article').count());
    if (!path) {
      const img = page.locator('#world-news .wire-thumbnail img').first();
      await img.evaluate(image => (image as HTMLImageElement).decode());
      assert.equal(await img.getAttribute('alt'), 'Illustration');
      assert.match(await img.getAttribute('src') || '', /assets\/headline-thumbnails\//);
      assert.ok(await page.locator('#world-news .wire-thumbnail figcaption button[aria-label*="credits" i]').count());
      assert.ok(await page.locator('#world-news .wire-thumbnail[data-published-miss="true"] .story-placeholder').count());
    }
    const thumbnail = page.locator('#world-news .wire-thumbnail img').first();
    const oldThumbnailSrc = await thumbnail.getAttribute('src');
    version++;
    const updated = page.waitForResponse('**/data/news.json');
    await page.clock.fastForward(300000);
    await updated; await ready();
    if (oldThumbnailSrc) {
      await page.waitForFunction(src => [...document.querySelectorAll<HTMLImageElement>('#world-news .wire-thumbnail img')].some(image => image.src !== src), oldThumbnailSrc);
      await thumbnail.evaluate(image => (image as HTMLImageElement).decode());
    }
    assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer2');
    if (!path) {
      const retainedThumbnail = await thumbnail.getAttribute('src');
      version++;
      olderSnapshot = true;
      const older = page.waitForResponse('**/data/news.json');
      await page.clock.fastForward(300000);
      await older; await ready();
      assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer2');
      assert.equal(await thumbnail.getAttribute('src'), retainedThumbnail);
      olderSnapshot = false;
    }
    offline = true;
    const failure = page.waitForResponse('**/data/news.json');
    await page.clock.fastForward(300000);
    await failure; await ready();
    assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer2');
    assert.deepEqual(sockets, []);
    assert.deepEqual(externalSearches, []);
    assert.equal(files.filter(file => file === 'data/news.json').length, path ? 3 : 4);
    if (path) assert.equal(files.filter(file => file === path + '/headlines.json').length, 3);
    await page.close();
  }
});
