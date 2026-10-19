import type { Snapshot } from '../relay/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/browser.ts';
import { SOURCES } from '../news-model.ts';
import french from '../locales/fr.ts';
import spanish from '../locales/es.ts';
import arabic from '../locales/ar.ts';
import chinese from '../locales/zh.ts';
import russian from '../locales/ru.ts';
import dutch from '../locales/nl.ts';
import german from '../locales/de.ts';

const collectedAt = new Date(Date.now() - 60_000).toISOString();
const editions = [
  {path: 'fr', lang: 'fr', dir: 'ltr', label: 'Français', messages: french},
  {path: 'es', lang: 'es', dir: 'ltr', label: 'Español', messages: spanish},
  {path: 'ar', lang: 'ar', dir: 'rtl', label: 'العربية', messages: arabic},
  {path: 'zh', lang: 'zh', dir: 'ltr', label: '中文', messages: chinese},
  {path: 'ru', lang: 'ru', dir: 'ltr', label: 'Русский', messages: russian},
  {path: 'nl', lang: 'nl', dir: 'ltr', label: 'Nederlands', messages: dutch},
  {path: 'de', lang: 'de', dir: 'ltr', label: 'Deutsch', messages: german},
] as const;
const publisherHeadline = '<img src=x onerror=window.pwned=true> أصل الخبر — 原始标题';
const snapshot: Snapshot = {
  schemaVersion: 2,
  generatedAt: collectedAt,
  sources: Object.fromEntries(SOURCES.map(source => [source.id, {
    stories: source.id === 'bbc' ? [{
      title: publisherHeadline,
      url: 'https://news.example.org/original-headline',
      summary: 'Publisher copy must remain hidden.',
      publishedAt: collectedAt,
      image: {url: 'https://images.example.org/publisher.png', alt: 'Publisher image', credit: 'Publisher'},
    }] : source.id === 'stringer' ? [{
      title: 'تقرير Stringer 原文报道',
      url: 'https://stringer.example.org/original-report',
      summary: 'Original Stringer reporting remains in its original language.',
      credits: 'Synthetic Journalist',
      publishedAt: collectedAt,
      image: {url: 'https://images.example.org/stringer.png', alt: 'Stringer photo', credit: 'Stringer'},
    }] : [],
    attemptedAt: collectedAt,
    lastSuccessAt: collectedAt,
    status: 'success',
    error: null,
  }])) as Snapshot['sources'],
};

async function openEdition(browser: Awaited<ReturnType<typeof launchBrowser>>, prefix: string, editionPath: string,
  options: {holdData?: boolean; unavailable?: boolean} = {}) {
  const page = await browser.newPage({viewport: {width: 375, height: 900}});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  let releaseData!: () => void;
  const dataGate = new Promise<void>(resolve => { releaseData = resolve; });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'edition.test') return route.abort();
    if (!url.pathname.startsWith(prefix)) return route.fulfill({status: 404});
    let file = url.pathname.slice(prefix.length) || 'index.html';
    if (file.endsWith('/')) file += 'index.html';
    if (file === 'relay-config.js') return route.fulfill({contentType: 'text/javascript', body: 'export default {enabled: false};'});
    if (file === 'data/news.json') {
      if (options.holdData) await dataGate;
      if (options.unavailable) return route.fulfill({status: 503, body: 'Unavailable'});
      return route.fulfill({json: snapshot});
    }
    if (file.includes('..') || !/^(?:(?:fr|es|ar|zh|ru|nl|de)\/index\.html|[a-z-]+\.(?:js|css|html)|assets\/[a-zA-Z0-9/.-]+\.png)$/.test(file))
      return route.fulfill({status: 404});
    try {
      const body = await readFile('_site/' + file);
      return route.fulfill({body, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'});
    } catch { return route.fulfill({status: 404}); }
  });
  await page.goto(`https://edition.test${prefix}${editionPath}/`);
  return {page, errors, releaseData};
}

test('localized editions preserve original headlines, direction, layout, loading, refresh, and language navigation', async () => {
  const browser = await launchBrowser();
  try {
    for (const edition of editions) {
      const {page, errors} = await openEdition(browser, '/', edition.path);
      await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('html').getAttribute('lang'), edition.lang);
      assert.equal(await page.locator('html').getAttribute('dir'), edition.dir);
      assert.equal(await page.locator('#world-title').textContent(), edition.messages['Global Newswire']);
      assert.equal(await page.locator('#source-picker').count(), 0, 'Global editions use the shared static source registry without a source picker');
      assert.equal(await page.locator('#global-newswire .source').first().textContent(), 'BBC World');
      assert.equal(await page.locator('#global-newswire h3').first().textContent(), publisherHeadline);
      assert.equal(await page.locator('#global-newswire img').count(), 0, 'Publisher images are not rendered');
      assert.equal(await page.locator('#global-newswire .summary').count(), 0, 'Publisher summaries are not rendered');
      assert.equal(await page.evaluate(() => (window as Window & {pwned?: boolean}).pwned), undefined, 'Headline markup stays text');
      assert.equal(await page.locator('#global-newswire article').first().getAttribute('dir'), 'auto');
      assert.equal(await page.locator('#stringer-news article').first().getAttribute('dir'), 'auto');
      assert.equal(await page.locator('#stringer-news h3').textContent(), 'تقرير Stringer 原文报道');
      assert.equal(await page.locator('#refresh-status').textContent(), '');

      for (const language of editions) {
        const link = page.getByRole('link', {name: language.label, exact: true});
        const href = await link.getAttribute('href');
        assert.equal(new URL(href!, page.url()).pathname, `/${language.path}/`);
      }
      await page.setViewportSize({width: 1280, height: 900});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${edition.lang} desktop layout overflows`);
      await page.setViewportSize({width: 375, height: 900});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${edition.lang} mobile layout overflows`);

      const menu = page.locator('.header-menu-toggle');
      await menu.click();
      assert.equal(await menu.getAttribute('aria-label'), edition.messages['Close menu']);
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-label'), edition.messages['Open menu']);
      assert.equal(await menu.evaluate(node => node === document.activeElement), true, 'Escape returns focus to the menu button');

      await page.getByRole('link', {name: 'العربية', exact: true}).click();
      await page.waitForURL('**/ar/');
      assert.equal(await page.locator('html').getAttribute('lang'), 'ar');

      assert.deepEqual(errors, [], `${edition.lang} produced browser errors`);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('localized reader shows loading and first-load failure, then retains a collection after refresh failure under the project base path', async () => {
  const browser = await launchBrowser();
  try {
    const first = await openEdition(browser, '/stringer-news/', 'zh', {holdData: true});
    await first.page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'true');
    await first.page.waitForFunction(() => document.querySelector('#relay-status')?.hidden === false);
    assert.ok((await first.page.locator('#relay-status-details').textContent())?.includes(chinese['Loading news…']), 'Loading progress uses the selected locale');
    first.releaseData();
    await first.page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
    assert.equal(await first.page.locator('#global-newswire article').count(), 1);
    assert.equal(await first.page.locator('#global-newswire h3').first().textContent(), publisherHeadline);
    assert.equal(await first.page.locator('#stringer-news article').count(), 1);

    await first.page.route('**/stringer-news/data/news.json', route => route.fulfill({status: 503, body: 'Unavailable'}));
    await first.page.clock.fastForward(300_000);
    await first.page.waitForFunction(expected => document.querySelector('#refresh-status')?.textContent === expected,
      chinese['Could not check for updates. Keeping the previously loaded collection.']);
    assert.equal(await first.page.locator('#global-newswire article').count(), 1, 'A failed refresh keeps the displayed publisher story');
    assert.equal(await first.page.locator('#stringer-news article').count(), 1, 'A failed refresh keeps Stringer reporting');
    assert.equal(await first.page.locator('html').getAttribute('lang'), 'zh');
    await first.page.close();

    const failed = await openEdition(browser, '/stringer-news/', 'ar', {unavailable: true});
    await failed.page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
    assert.equal(await failed.page.locator('#global-newswire article').count(), 0);
    assert.equal(await failed.page.locator('#stringer-news article').count(), 0);
    assert.equal(await failed.page.locator('#refresh-status').textContent(), arabic['The news collection is unavailable. We’ll retry automatically.']);
    assert.equal(await failed.page.locator('html').getAttribute('dir'), 'rtl');
    assert.deepEqual([...failed.errors], []);
    await failed.page.close();
  } finally { await browser.close(); }
});
