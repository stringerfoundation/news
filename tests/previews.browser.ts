import type { Browser } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { launchBrowser } from '../scripts/browser.ts';
import sharp from 'sharp';
import { SOURCES } from '../news-model.ts';

test('built production and PR previews preserve relative assets, indexing and mobile behavior', async () => {
  const root = resolve('.test-output/previews-browser');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  // Use the real publisher and checked build; synthetic news stays inside this test server.
  execFileSync('python3', ['-B', '-c', `from pathlib import Path; import runpy; p = runpy.run_path('scripts/pages-preview.py'); p['apply_site'](Path(${JSON.stringify(root)}), Path('_site')); p['apply_site'](Path(${JSON.stringify(root)}), Path('_site'), '18', '${'a'.repeat(40)}')`]);
  const at = new Date().toISOString();
  const thumbnail = 'assets/headline-thumbnails/' + 'a'.repeat(64) + '.webp';
  const image = {version: 1, title: 'Sample map', alt: 'Sample map', creator: 'Map artist', attribution: 'Map artist',
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Map.jpg', filePage: 'https://commons.wikimedia.org/wiki/File:Map.jpg',
    license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'};
  const webp = await sharp({create: {width: 16, height: 16, channels: 3, background: 'blue'}}).webp().toBuffer();
  const snapshot = { thumbnails: {'https://example.test/bbc/0': {file: thumbnail, image, suggested: true}}, schemaVersion: 2, generatedAt: at, sources: Object.fromEntries(SOURCES.map(source => [source.id, {
    attemptedAt: at, lastSuccessAt: at, status: 'success', error: null,
    stories: Array.from({ length: 6 }, (_, index) => ({ title: `Synthetic ${source.id} fixture ${index}`, url: `https://example.test/${source.id}/${index}`,
      summary: 'Synthetic test fixture.', credits: 'Fixture author', publishedAt: at, image: null })),
  }])) };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const name = url.pathname.replace(/^\/news\//, '') || 'index.html';
    const path = resolve(root, name.endsWith('/') ? name + 'index.html' : name);
    if (relative(root, path).startsWith('..')) { response.writeHead(404).end(); return; }
    try {
      const data = name.endsWith('data/news.json') ? JSON.stringify(snapshot)
        : name.endsWith(thumbnail) ? webp
        : name.endsWith('relay-config.js') ? 'export default {enabled:false,publishedReader:true};' : await readFile(path);
      response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'text/html');
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();
    for (const width of [375, 1280]) for (const preview of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors: string[] = [], failedAssets: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().includes('/news/') && !response.ok()) failedAssets.push(response.url()); });
      const path = '/news/' + (preview ? 'pr-preview/18/' : '');
      if (preview) await page.clock.setFixedTime(new Date(Date.parse(at) + 48 * 60 * 60_000));
      await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
      await page.waitForSelector('#world-news article');
      if (preview) {
        assert.match(await page.locator('#page-title + .build-info').innerText(), /Preview/);
        const img = page.locator('#world-news img').first();
        await img.evaluate(node => (node as HTMLImageElement).decode());
        assert.equal(await img.evaluate(node => (node as HTMLImageElement).naturalWidth), 16);
        assert.ok((await img.getAttribute('src'))?.includes(path + thumbnail));
      }
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      assert.equal(robots?.includes('noindex'), true);
      assert.equal(await page.locator('#world-news article').count(), 30);
      if (width === 375) assert.equal(await page.locator('#world-news article:not([hidden])').count(), 5);
      else {
        const bounds = await page.evaluate(() => {
          const cards = [...document.querySelectorAll<HTMLElement>('#world-news article')].filter(card => !card.hidden);
          const last = cards.at(-1)!.getBoundingClientRect();
          return { bottom: last.bottom, height: last.height, reportingBottom: document.querySelector<HTMLElement>('#stringer-news')!.getBoundingClientRect().bottom };
        });
        assert.ok(bounds.bottom <= bounds.reportingBottom + bounds.height + 1);
      }
      const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const commit = page.locator('#reader-build .build-commit');
      assert.equal(await commit.getAttribute('href'), `https://github.com/stringerfoundation/news/commit/${revision}`);
      await commit.focus();
      assert.ok(await commit.evaluate(node => node === document.activeElement));
      assert.ok(await page.locator('#reader-build .build-repository svg').isVisible());
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
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  }
});
