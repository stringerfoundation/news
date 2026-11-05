import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { load } from 'cheerio';
import { launchBrowser } from './browser.ts';
import type { Browser } from '@playwright/test';
import { PUBLIC_MODULES } from '../public-assets.ts';

const requiredAssets = ['app.js', 'news-model.js', 'relay-config.js', 'relay-reader.js', 'style.css'];
const monitoredAssets = new Set([...PUBLIC_MODULES.map(name => `${name}.js`), 'relay-reader.js', 'style.css']);

export function homepageURL(value: string | undefined) {
  if (!value) throw new Error('Set READER_PUBLIC_URL to the final public homepage URL.');
  const url = new URL(value);
  assert.ok(url.protocol === 'https:' && !url.username && !url.password,
    'READER_PUBLIC_URL must use HTTPS without credentials');
  return url.href;
}

export function artifactVersion(html: string) {
  const $ = load(html);
  const app = $('script[src]').toArray().map(el => $(el).attr('src'))
    .find(src => /(?:^|\/)app\.js\?/.test(src!));
  const version = new URL(app || '', 'https://artifact.invalid/').searchParams.get('v');
  assert.match(version || '', /^[a-f0-9]{16}$/, 'Build the reader before checking its deployed version');
  return version!;
}

// Each viewport starts without cookies, storage, service workers or an HTTP cache.
// Partial collections can pass, but a failed refresh or an empty column cannot.
export async function checkHomepage(browser: Pick<Browser, 'newContext'>, url: string, expectedVersion: string, {
  firstStoryMs = 5000, completionMs = 15000, widths = [1280, 375],
}: { firstStoryMs?: number; completionMs?: number; widths?: number[] } = {}) {
  assert.match(expectedVersion, /^[a-f0-9]{16}$/);
  assert.ok(firstStoryMs > 0 && completionMs >= firstStoryMs, 'Invalid loading budgets');
  const results = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      const assets = new Map<string, string | null>();
      page.on('pageerror', error => errors.push(error.message));
      page.on('requestfailed', request => {
        const name = new URL(request.url()).pathname.split('/').at(-1)!;
        if (monitoredAssets.has(name)) errors.push('Reader asset request failed');
      });
      page.on('response', response => {
        const asset = new URL(response.url());
        const name = asset.pathname.split('/').at(-1)!;
        if (!monitoredAssets.has(name)) return;
        assets.set(name, asset.searchParams.get('v'));
        if (!response.ok()) errors.push(`Reader asset returned HTTP ${response.status()}`);
      });
      const start = performance.now();
      const remaining = (budget: number) => Math.max(1, budget - (performance.now() - start));
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining(completionMs) });
      assert.ok(response?.ok(), 'Homepage must return a successful response');
      await page.locator('#world-news article, #stringer-news article').first()
        .waitFor({ state: 'visible', timeout: remaining(firstStoryMs) });
      const firstStory = performance.now() - start;
      assert.ok(firstStory <= firstStoryMs, `First story exceeded ${firstStoryMs} ms`);
      for (const id of ['world-news', 'stringer-news'])
        await page.locator(`#${id}[aria-busy="false"] article`).first()
          .waitFor({ state: 'visible', timeout: remaining(completionMs) });
      const completed = performance.now() - start;
      assert.ok(completed <= completionMs, `Loading exceeded ${completionMs} ms`);
      assert.match(await page.locator('#relay-status summary').innerText(), /loaded in/i,
        'Displayed stories must not hide a failed refresh');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      assert.deepEqual(errors, [], 'Reader errors');
      for (const name of requiredAssets)
        assert.equal(assets.get(name), expectedVersion, `${name} must use the approved asset version`);
      for (const [name, version] of assets)
        assert.equal(version, expectedVersion, `${name} must use the approved asset version`);
      results.push({ width, version: expectedVersion, firstStoryMs: Math.round(firstStory),
        completedMs: Math.round(completed),
        headlines: await page.locator('#world-news article').count(),
        stories: await page.locator('#stringer-news article').count(),
        feedStatus: await page.locator('#relay-status-details').textContent() });
    } finally {
      await context.close();
    }
  }
  return results;
}

export async function runSmoke({ env = process.env, read = readFile, launch = launchBrowser, write = console.log }: {
  env?: NodeJS.ProcessEnv; read?: typeof readFile; launch?: typeof launchBrowser; write?: (value: string) => void;
} = {}) {
  const url = homepageURL(env.READER_PUBLIC_URL);
  const expected = env.EXPECTED_READER_VERSION
    || artifactVersion(await read(new URL('../_site/index.html', import.meta.url), 'utf8'));
  assert.match(expected, /^[a-f0-9]{16}$/);
  const browser = await launch();
  try {
    write(JSON.stringify(await checkHomepage(browser, url, expected), null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runSmoke();
