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
  const publicDomainPhoto = {...photo, title: 'Public domain fixture', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/'};
  const webp = await sharp({create: {width: 2, height: 2, channels: 3, background: 'skyblue'}}).webp().toBuffer();
  for (const path of ['', 'fr', 'sw']) {
    const page = await browser.newPage();
    await page.setViewportSize({width: 375, height: 850});
    await page.clock.install();
    const sockets: string[] = [], files: string[] = [], externalSearches: string[] = [];
    let version = 1;
    let offline = false;
    let olderSnapshot = false;
    let releaseFirstHeadline!: () => void;
    const firstHeadline = new Promise<void>(resolve => { releaseFirstHeadline = resolve; });
    let firstHeadlineHeld = false;
    const publisher = path === 'sw' ? 'dw' : EDITION_SOURCES.fr![0]!.id;
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
        if (path === 'fr' && file === `${path}/headlines.json` && !firstHeadlineHeld) {
          firstHeadlineHeld = true;
          await firstHeadline;
        }
        if (offline) return route.fulfill({status: 503});
        const entry = (name: string) => ({
          attemptedAt: at, lastSuccessAt: at, status: 'success', error: null,
          stories: [{title: name === SOURCES[2]!.id ? 'Unchanged headline' : name + version, url: 'https://example.org/' + name, summary: 'Reporting', credits: 'Reporter',
            publishedAt: at, image: null, noteId: name === SOURCES[1]!.id ? 'c'.repeat(64) : id, clusterId: group}],
        });
        const thumbnailPath = `assets/headline-thumbnails/${String(version).padStart(64, '0')}.webp`;
        const thumbnail = {file: thumbnailPath, image: photo, suggested: version === 1};
        const publicDomainThumbnail = {file: 'assets/headline-thumbnails/' + 'a'.repeat(64) + '.webp', image: publicDomainPhoto, suggested: version === 1};
        if (file === 'data/news.json') return route.fulfill({json: {
          generatedAt: olderSnapshot ? new Date(Date.parse(at) - 1000).toISOString() : at, schemaVersion: 2, sources: Object.fromEntries(SOURCES.map(source => [source.id, entry(source.id)])),
          illustrations: {['c'.repeat(64)]: photo, invalid: {}},
          thumbnails: Object.fromEntries([...SOURCES.map((source, index) => [`https://example.org/${source.id}`, index === 0 ? thumbnail : index === 2 ? publicDomainThumbnail : null]),
            ['https://example.org/invalid-type', false],
            ['https://example.org/invalid-path', {file: '../outside.webp', image: photo, suggested: false}],
            ['https://example.org/invalid-credits', {file: thumbnailPath, image: {...photo, alt: ''}, suggested: false}],
          ]),
        }});
        return route.fulfill({json: {generatedAt: at, sources: {[publisher]: entry(publisher)}, thumbnails: {[`https://example.org/${publisher}`]: thumbnail}}});
      }
      if (!file || file.endsWith('/')) {
        let html = await readFile(`_site/${file}index.html`, 'utf8');
        if (path === 'fr') {
          const embedded = {[publisher]: {lastSuccessAt: at, stories: [{title: 'Embedded headline', url: `https://example.org/${publisher}`,
            summary: 'Reporting', credits: 'Reporter', publishedAt: at, image: null}]}};
          const script = `<script id="atomstr-headlines" type="application/json">${JSON.stringify(embedded)}</script>`;
          html = html.includes('id="atomstr-headlines"') ? html.replace(/<script[^>]*id="atomstr-headlines"[^>]*>[\s\S]*?<\/script>/, script) : html.replace('</head>', `${script}</head>`);
        }
        return route.fulfill({contentType: 'text/html', body: html});
      }
      if (!isPublicAsset(file)) return route.abort();
      if (file.startsWith('assets/headline-thumbnails/')) return route.fulfill({contentType: 'image/webp', body: webp});
      return route.fulfill({contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'image/png', body: await readFile('_site/' + file)});
    });
    await page.goto('https://reader.test/' + (path ? path + '/' : ''));
    if (path === 'fr') {
      await page.locator('#world-news h3').filter({hasText: 'Embedded headline'}).waitFor();
      assert.deepEqual(externalSearches, []);
      releaseFirstHeadline();
    }
    const ready = () => page.locator('#stringer-news[aria-busy="false"] article').first().waitFor();
    await ready();
    assert.equal(await page.locator('#stringer-news h3').first().textContent(), 'stringer1');
    assert.ok(await page.locator('#world-news article').count());
    if (!path) await page.setViewportSize({width: 320, height: 850});
    if (path === 'fr') {
      const localizedSuggestion = page.locator('#world-news .image-suggested-label').first();
      await localizedSuggestion.waitFor();
      assert.equal((await localizedSuggestion.textContent())?.trim(), 'Image suggérée automatiquement');
    }
    if (!path) {
      const img = page.locator('#world-news .wire-thumbnail img').first();
      await img.evaluate(image => (image as HTMLImageElement).decode());
      assert.equal(await img.getAttribute('alt'), 'Illustration');
      assert.match(await img.getAttribute('src') || '', /assets\/headline-thumbnails\//);
      assert.ok(await page.locator('#world-news .wire-thumbnail figcaption button[aria-label*="credits" i]').count());
      const suggestedCard = img.locator('xpath=ancestor::article');
      await suggestedCard.locator('.image-suggested-label').waitFor();
      assert.equal((await suggestedCard.locator('.image-suggested-label').textContent())?.trim(), 'Automatically suggested image');
      assert.equal(await img.getAttribute('aria-description'), 'Automatically suggested image');
      await suggestedCard.locator('.image-credit-button').click();
      const credits = page.locator('dialog[aria-labelledby="image-credit-title"] .image-credit-entry').first();
      await credits.waitFor();
      assert.match(await credits.textContent() || '', /Creator/);
      assert.match(await credits.textContent() || '', /CC BY 4\.0/);
      assert.match(await credits.textContent() || '', /Thumbnail resized and converted to WebP/);
      await page.locator('dialog[aria-labelledby="image-credit-title"] .reader-dialog-close').click();
      const publicDomainCard = page.locator('#world-news article').filter({has: page.locator('h3', {hasText: 'Unchanged headline'})}).first();
      await publicDomainCard.locator('.image-suggested-label').waitFor();
      await publicDomainCard.locator('img').evaluate(img => img.setAttribute('data-before-approval', 'true'));
      assert.equal(await publicDomainCard.locator('.image-credit-button').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.locator('#world-news .wire-thumbnail[data-published-miss="true"] .story-placeholder:visible').first().waitFor();
      await page.locator('#relay-status').click();
      await page.locator('#headline-image-status li:visible').filter({hasText: 'Image unavailable'}).first().waitFor();
      await page.locator('#feed-status-dialog .reader-dialog-close').click();
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
      const approvedCard = thumbnail.locator('xpath=ancestor::article');
      assert.equal(await approvedCard.locator('.image-suggested-label').count(), 0);
      assert.equal(await thumbnail.getAttribute('aria-description'), null);
      const approvedPublicDomainCard = page.locator('#world-news article').filter({has: page.locator('h3', {hasText: 'Unchanged headline'})}).first();
      await approvedPublicDomainCard.locator('.image-suggested-label').waitFor({state: 'detached'});
      assert.equal(await approvedPublicDomainCard.locator('img').getAttribute('data-before-approval'), 'true');
      assert.equal(await approvedPublicDomainCard.locator('.image-credit-caption').evaluate(node => (node as HTMLElement).hidden), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    }
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
