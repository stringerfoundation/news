import test from 'node:test';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { launchBrowser } from '../scripts/browser.mjs';
import { PORTUGUESE_SOURCES } from '../portuguese-sources.js';
import { SOURCES } from '../news-model.js';

const time = new Date(Date.now() - 60_000).toISOString();
const keys = new Map(PORTUGUESE_SOURCES.map(source => [source.id, generateSecretKey()]));
const catalogue = PORTUGUESE_SOURCES.map(source => ({...source, feeds: [{...source.feeds[0], pubkey: getPublicKey(keys.get(source.id))}]}));
const headlines = new Map([
  ['pt-cnnbrasil', 'Manchete original — ação e informação'],
  ['pt-observador', 'Outra manchete original, sem tradução'],
  ['pt-fapesp', '<img src=x onerror=window.pwned=true> Pesquisa original'],
]);
const events = catalogue.filter(source => headlines.has(source.id)).map(source => finalizeEvent({kind: 1,
  created_at: Math.floor(Date.parse(time) / 1000),
  content: headlines.get(source.id) + '\n\nResumo e imagem que não devem aparecer.\n\nhttps://images.example.org/publisher-photo.jpg',
  tags: [['proxy', source.feeds[0].url + '#' + encodeURIComponent('https://news.example.org/' + source.id), 'rss']],
}, keys.get(source.id)));
const baseline = {schemaVersion: 2, generatedAt: time, sources: Object.fromEntries(SOURCES.map(source => [source.id,
  {stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null}]))};
baseline.sources.stringer = {stories: [{title: 'Original Stringer reporting', credits: 'Synthetic Reporter',
  url: 'https://example.org/stringer-report', summary: 'Original reporting stays in its original language.',
  publishedAt: time, image: {url: 'https://images.example.org/stringer.png', alt: 'Stringer photo', credit: 'Stringer'}}],
  attemptedAt: time, lastSuccessAt: time, status: 'success', error: null};

test('Portuguese editions share all sources and preferences, localize only UI, refresh and recover from unavailable mirrors', async () => {
  const syntheticBundle = await build({entryPoints: ['app.js'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
    external: ['./news-model.js', './relay-config.js', './stringer-media.js', './relay-reader.js', './portuguese-reader.js'],
    plugins: [{name: 'synthetic-catalogue', setup(builder) {
      builder.onLoad({filter: /portuguese-sources\.js$/}, () => ({loader: 'js', contents: `export const ATOMSTR_RELAY='wss://nostr.data.haus';export const PORTUGUESE_SOURCES=${JSON.stringify(catalogue)};`}));
    }}]});
  const browser = await launchBrowser();
  try {
    for (const prefix of ['/', '/stringer-news/']) {
      const page = await browser.newPage({viewport: {width: 375, height: 1000}});
      const errors = [], requested = [];
      let unavailable = false, subscriptions = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requested.push(request.url()));
      await page.clock.install();
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'images.example.org' && url.pathname === '/stringer.png')
          return route.fulfill({body: await readFile('assets/favicon-192.png'), contentType: 'image/png'});
        if (url.hostname !== 'edition.test') return route.abort();
        if (!url.pathname.startsWith(prefix)) return route.fulfill({status: 404});
        let file = url.pathname.slice(prefix.length) || 'index.html';
        if (['br', 'pt'].includes(file)) return route.fulfill({status: 308, headers: {location: prefix + file + '/'}});
        if (file.endsWith('/')) file += 'index.html';
        if (file === 'app.js') return route.fulfill({contentType: 'text/javascript', body: syntheticBundle.outputFiles[0].text});
        if (file === 'relay-config.js') return route.fulfill({contentType: 'text/javascript', body: 'export default {enabled: false};'});
        if (file === 'portuguese-sources.js') return route.fulfill({contentType: 'text/javascript', body: `export const ATOMSTR_RELAY='wss://nostr.data.haus';export const PORTUGUESE_SOURCES=${JSON.stringify(catalogue)};`});
        if (file === 'data/news.json') return route.fulfill({json: baseline});
        if (file.includes('..') || !/^(?:(?:br|pt)\/index\.html|[a-z-]+\.(?:js|css|html)|assets\/[a-zA-Z0-9/.-]+\.png)$/.test(file)) return route.fulfill({status: 404});
        try { return route.fulfill({body: await readFile('_site/' + file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'}); }
        catch { return route.fulfill({status: 404}); }
      });
      await page.routeWebSocket('wss://nostr.data.haus/', socket => socket.onMessage(raw => {
        const [type, id, filter] = JSON.parse(String(raw));
        if (type !== 'REQ') return;
        subscriptions++;
        assert.ok(filter.authors.length > 0 && filter.limit === 30);
        if (!unavailable) for (const event of events.filter(event => filter.authors.includes(event.pubkey)))
          socket.send(JSON.stringify(['EVENT', id, event]));
        socket.send(JSON.stringify(['EOSE', id]));
      }));
      await page.goto('https://edition.test' + prefix + 'br/');
      await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('html').getAttribute('lang'), 'pt-BR');
      assert.equal(await page.locator('#world-title').textContent(), 'Notícias em português');
      assert.equal(await page.locator('#global-newswire article').count(), 3);
      assert.ok((await page.locator('#global-newswire h3').allTextContents()).includes(headlines.get('pt-cnnbrasil')));
      assert.equal(await page.locator('#global-newswire img').count(), 0);
      assert.equal(await page.locator('#global-newswire .summary').count(), 0);
      assert.equal(await page.evaluate(() => window.pwned), undefined);
      assert.ok((await page.locator('#world-news time').first().getAttribute('title')).includes('espelho Atomstr'));
      assert.equal(await page.locator('#stringer-news h3').textContent(), 'Original Stringer reporting');
      assert.equal(await page.locator('#stringer-news img').count(), 1);
      await page.locator('#source-picker > summary').click();
      assert.equal(await page.locator('#source-options input').count(), catalogue.length);
      await page.locator('#source-search').fill('fapesp');
      assert.equal(await page.locator('#source-options label:visible').count(), 1);
      await page.locator('#source-search').fill('sem-correspondencias');
      assert.equal(await page.locator('#no-matching-sources').isVisible(), true);
      await page.locator('#source-search').fill('cnn');
      await page.locator('#source-options input[value="pt-cnnbrasil"]').uncheck();
      assert.equal(await page.locator('#global-newswire article').count(), 2);
      assert.equal(subscriptions, catalogue.length, 'Toggling sources does not query the relay again');
      await page.getByRole('link', {name: 'Português (Portugal)', exact: true}).click();
      await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('html').getAttribute('lang'), 'pt-PT');
      assert.equal(await page.locator('#global-newswire article').count(), 2);
      assert.equal(await page.locator('.source-help').textContent(), 'As suas escolhas ficam guardadas neste navegador.');
      assert.match(await page.locator('#source-count').textContent(), /97 de 98 ativas/);
      unavailable = true;
      await page.clock.fastForward(300_000);
      await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('#global-newswire article').count(), 2, 'Previously verified stories survive an unavailable mirror');
      assert.match(await page.locator('#world-status').textContent(), /atualização indisponível/);
      await page.setViewportSize({width: 1280, height: 1000});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await mkdir('.test-output', {recursive: true});
      await page.screenshot({path: `.test-output/portuguese-desktop-${prefix === '/' ? 'root' : 'project'}.png`});
      await page.setViewportSize({width: 375, height: 1000});
      await page.locator('#source-picker > summary').click();
      await page.screenshot({path: `.test-output/portuguese-mobile-${prefix === '/' ? 'root' : 'project'}.png`});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(!requested.some(url => url.includes('publisher-photo.jpg')));
      await page.getByRole('link', {name: 'EN', exact: true}).click();
      await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      assert.equal(await page.locator('#source-picker').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
