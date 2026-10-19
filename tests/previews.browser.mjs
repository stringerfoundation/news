import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { launchBrowser } from '../scripts/browser.mjs';
import { SOURCES } from '../news-model.js';

test('built production and PR previews preserve relative assets, indexing and mobile behavior', async () => {
  const root = resolve('.test-output/previews-browser');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  // Use the real publisher and checked build; synthetic news stays inside this test server.
  execFileSync('python3', ['-B', '-c', `from pathlib import Path; import runpy; p = runpy.run_path('scripts/pages-preview.py'); p['apply_site'](Path(${JSON.stringify(root)}), Path('_site')); p['apply_site'](Path(${JSON.stringify(root)}), Path('_site'), '18', '${'a'.repeat(40)}')`]);
  const at = '2026-10-19T14:42:00.000Z';
  const snapshot = { schemaVersion: 2, generatedAt: at, sources: Object.fromEntries(SOURCES.map(source => [source.id, {
    attemptedAt: at, lastSuccessAt: at, status: 'success', error: null,
    stories: Array.from({ length: 6 }, (_, index) => ({ title: `Synthetic ${source.id} fixture ${index}`, url: `https://example.test/${source.id}/${index}`,
      summary: 'Synthetic test fixture.', credits: 'Fixture author', publishedAt: at, image: null })),
  }])) };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const name = url.pathname.replace(/^\/news\//, '') || 'index.html';
    const path = resolve(root, name.endsWith('/') ? name + 'index.html' : name);
    if (relative(root, path).startsWith('..')) { response.writeHead(404).end(); return; }
    try {
      const data = name.endsWith('data/news.json') ? JSON.stringify(snapshot)
        : name.endsWith('relay-config.js') ? 'export default {enabled:false};' : await readFile(path);
      response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.png') ? 'image/png' : 'text/html');
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launchBrowser();
    for (const width of [375, 1280]) for (const preview of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [], failedAssets = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().includes('/news/') && !response.ok()) failedAssets.push(response.url()); });
      const path = '/news/' + (preview ? 'pr-preview/18/' : '');
      await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
      await page.waitForSelector('#world-news article');
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      assert.equal(robots.includes('noindex'), preview);
      assert.equal(await page.locator('#world-news article').count(), 30);
      assert.equal(await page.locator('#world-news article:not([hidden])').count(), width === 375 ? 5 : 30);
      if (width === 375) {
        await page.locator('#world-more').click();
        assert.equal(await page.locator('#world-news article:not([hidden])').count(), 30);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      assert.deepEqual(failedAssets, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
});
