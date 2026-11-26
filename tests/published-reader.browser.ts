import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/browser.ts';
import { SOURCES } from '../news-model.ts';
import { EDITION_SOURCES } from '../edition-sources.ts';
import { isPublicAsset } from '../public-assets.ts';

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
  for (const path of ['', 'fr', 'sw']) {
    const page = await browser.newPage();
    await page.clock.install();
    const sockets: string[] = [], files: string[] = [];
    let version = 1;
    let offline = false;
    await page.routeWebSocket('**/*', socket => { sockets.push(socket.url()); socket.close(); });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.href === photo.url) return route.fulfill({contentType: 'image/png', body: await readFile('assets/favicon-16.png')});
      if (url.hostname !== 'reader.test') return route.abort();
      const file = url.pathname.slice(1);
      if (file.endsWith('.json')) {
        files.push(file);
        if (offline) return route.fulfill({status: 503});
        const entry = (name: string) => ({
          attemptedAt: at, lastSuccessAt: at, status: 'success', error: null,
          stories: [{title: name + version, url: 'https://example.org/' + name, summary: 'Reporting', credits: 'Reporter',
            publishedAt: at, image: null, noteId: id, clusterId: group}],
        });
        if (file === 'data/news.json') return route.fulfill({json: {
          generatedAt: at, schemaVersion: 2, sources: Object.fromEntries(SOURCES.map(source => [source.id, entry(source.id)])),
          illustrations: {[id]: photo, invalid: {}},
        }});
        const publisher = path === 'sw' ? 'dw' : EDITION_SOURCES.fr![0]!.id;
        return route.fulfill({json: {generatedAt: at, sources: {[publisher]: entry(publisher)}}});
      }
      if (!file || file.endsWith('/')) return route.fulfill({contentType: 'text/html', body: await readFile(`_site/${file}index.html`)});
      if (!isPublicAsset(file)) return route.abort();
      return route.fulfill({contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'image/png', body: await readFile('_site/' + file)});
    });
    await page.goto('https://reader.test/' + (path ? path + '/' : ''));
    const ready = () => page.locator('#stringer-news[aria-busy="false"] article').first().waitFor();
    await ready();
    assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer1');
    assert.ok(await page.locator('#world-news article').count());
    if (!path) assert.equal(await page.locator('#world-news .wire-thumbnail img').first().getAttribute('alt'), 'Illustration');
    version++;
    const updated = page.waitForResponse('**/data/news.json');
    await page.clock.fastForward(300000);
    await updated; await ready();
    assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer2');
    offline = true;
    const failure = page.waitForResponse('**/data/news.json');
    await page.clock.fastForward(300000);
    await failure; await ready();
    assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer2');
    assert.deepEqual(sockets, []);
    assert.equal(files.filter(file => file === 'data/news.json').length, 3);
    if (path) assert.equal(files.filter(file => file === path + '/headlines.json').length, 3);
    await page.close();
  }
});
