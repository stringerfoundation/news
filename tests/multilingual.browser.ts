import { build } from 'esbuild';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { EDITION_SOURCES } from '../edition-sources.ts';
import { browserExternals } from '../scripts/browser-build.ts';
import type { Snapshot } from '../relay/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser } from '../scripts/browser.ts';
import { SOURCES } from '../news-model.ts';
import french from '../locales/fr.ts';
import spanish from '../locales/es.ts';
import arabic from '../locales/ar.ts';
import chinese from '../locales/zh.ts';
import russian from '../locales/ru.ts';
import dutch from '../locales/nl.ts';
import german from '../locales/de.ts';
import swahili from '../locales/sw.ts';
import { swahiliPublisher } from '../sources/sw.ts';
import { collectedSwahiliPublishers } from '../swahili-publishers.ts';
import { embedSwahiliHeadlines } from '../scripts/collect-swahili.ts';

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

// Every fixture uses a fresh signing key; no notes are published to a real relay.
const keys = new Map(Object.values(EDITION_SOURCES).flatMap(sources => sources.map(source => [source.id, generateSecretKey()] as const)));
const catalogues = Object.fromEntries(Object.entries(EDITION_SOURCES).map(([locale, sources]) => [locale,
  sources.map(source => ({...source, feeds: [{...source.feeds[0]!, pubkey: getPublicKey(keys.get(source.id)!)}]})),
]));
const notes = Object.fromEntries(Object.entries(catalogues).map(([locale, sources]) => {
  const source = sources[0]!;
  return [locale, finalizeEvent({kind: 1, created_at: Math.floor(Date.parse(collectedAt) / 1000),
    tags: [['proxy', `${source.feeds[0]!.url}#${encodeURIComponent('https://news.example.org/original-headline')}`, 'rss']],
    content: `${publisherHeadline}\n\nPublisher copy must remain hidden.`,
  }, keys.get(source.id)!)];
}));
const fixtureApp = await build({entryPoints: ['app.ts'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
  plugins: [browserExternals, {name: 'synthetic-edition-identities', setup(builder) {
    builder.onLoad({filter: /edition-sources\.ts$/}, () => ({loader: 'js', contents:
      `const sources=${JSON.stringify(catalogues)}; export function sourcesForLocale(locale) { return sources[locale] || []; }`}));
  }}],
});

async function openEdition(browser: Awaited<ReturnType<typeof launchBrowser>>, prefix: string, editionPath: string,
  options: {holdData?: boolean; unavailable?: boolean; builtApp?: boolean; illustrations?: 'related' | 'unrelated'; firstConnectionFailure?: 'drop' | 'silent'} = {}) {
  const page = await browser.newPage({viewport: {width: 375, height: 900}});
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  let mirrorUnavailable = options.unavailable ?? false;
  let mirrorConnections = 0;
  let onFirstQuery!: () => void;
  const firstQuery = new Promise<void>(resolve => { onFirstQuery = resolve; });
  let releaseData!: () => void;
  const dataGate = new Promise<void>(resolve => { releaseData = resolve; });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (options.illustrations && url.hostname === 'fr.wikipedia.org') {
      assert.equal(url.searchParams.get('gsrsearch'), publisherHeadline);
      assert.equal(url.searchParams.get('gsrlimit'), '5');
      return route.fulfill({json: {query: {pages: [
        {title: 'Unrelated person', pageimage: 'Unrelated.png'},
        {title: '无关', pageimage: 'Unrelated.png'},
        {pageimage: 'Unrelated.png'},
        ...(options.illustrations === 'related' ? [
          {title: 'أصل الخبر'},
          {title: '原始标题', pageimage: 'Illustration.png'},
        ] : []),
      ]}}});
    }
    if (options.illustrations && url.hostname === 'commons.wikimedia.org') {
      if (url.searchParams.has('titles')) {
        assert.equal(options.illustrations, 'related');
        assert.equal(url.searchParams.get('titles'), 'File:Illustration.png');
      }
      const pages = url.searchParams.has('titles') ? [{
        title: 'File:Illustration.png',
        imageinfo: [{mime: 'image/png', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Illustration.png',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Illustration.png',
          extmetadata: {Artist: {value: 'Example creator'}, LicenseUrl: {value: 'https://creativecommons.org/licenses/by/4.0/'}}}],
      }] : [];
      return route.fulfill({json: {query: {pages}}});
    }
    if (options.illustrations && url.hostname === 'upload.wikimedia.org')
      return route.fulfill({contentType: 'image/png', body: await readFile('assets/favicon-16.png')});
    if (url.hostname !== 'edition.test') return route.abort();
    if (!url.pathname.startsWith(prefix)) return route.fulfill({status: 404});
    let file = url.pathname.slice(prefix.length) || 'index.html';
    if (file.endsWith('/')) file += 'index.html';
    if (file === 'app.js' && !options.builtApp) return route.fulfill({contentType: 'text/javascript', body: fixtureApp.outputFiles[0]!.text});
    if (file === 'relay-config.js') return route.fulfill({contentType: 'text/javascript', body: 'export default {enabled: false};'});
    if (file === 'data/news.json') {
      if (options.holdData) await dataGate;
      if (options.unavailable) return route.fulfill({status: 503, body: 'Unavailable'});
      return route.fulfill({json: snapshot});
    }
    if (file.includes('..') || !/^(?:(?:fr|es|ar|zh|ru|nl|de|sw)\/index\.html|[a-z-]+\.(?:js|css|html)|assets\/[a-zA-Z0-9/.-]+\.png)$/.test(file))
      return route.fulfill({status: 404});
    try {
      const body = await readFile('_site/' + file);
      return route.fulfill({body, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html'});
    } catch { return route.fulfill({status: 404}); }
  });
  await page.routeWebSocket('wss://nostr.data.haus/', socket => {
    const connection = ++mirrorConnections;
    let dropping = false;
    socket.onMessage(async raw => {
      const [type, id, filter] = JSON.parse(String(raw));
      if (type !== 'REQ') return;
      if (options.firstConnectionFailure && connection === 1) {
        onFirstQuery();
        if (options.firstConnectionFailure === 'drop' && !dropping) { dropping = true; await socket.close({code: 1011}); }
        return;
      }
      if (options.holdData) await dataGate;
      if (mirrorUnavailable) return socket.send(JSON.stringify(['CLOSED', id, 'error: mirror unavailable']));
      for (const note of Object.values(notes)) {
        if (filter.authors.includes(note.pubkey)) socket.send(JSON.stringify(['EVENT', id, note]));
      }
      socket.send(JSON.stringify(['EOSE', id]));
    });
  });
  await page.goto(`https://edition.test${prefix}${editionPath}/`);
  if (options.firstConnectionFailure === 'silent') {
    await firstQuery;
    await page.clock.runFor(8100);
  }
  return {page, errors, releaseData, get mirrorConnections() { return mirrorConnections; }, stopMirrors() { mirrorUnavailable = true; }};
}

test('localized editions preserve original headlines, direction, layout, loading, refresh, and language navigation', {timeout: 60_000}, async () => {
  const browser = await launchBrowser();
  try {
    for (const edition of editions) {
      const firstConnectionFailure = edition.lang === 'nl' ? 'drop' : edition.lang === 'es' ? 'silent' : undefined;
      const view = await openEdition(browser, '/', edition.path, firstConnectionFailure ? {firstConnectionFailure} : {});
      const {page, errors} = view;
      await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('html').getAttribute('lang'), edition.lang);
      assert.equal(await page.locator('html').getAttribute('dir'), edition.dir);
      assert.equal(await page.locator('#world-title').textContent(), edition.messages['Global Newswire']);
      assert.equal(await page.locator('#source-options input').count(), catalogues[edition.lang]!.length, 'Each edition exposes only its own publisher catalogue');
      assert.equal(await page.locator('#source-options input').first().getAttribute('value'), catalogues[edition.lang]![0]!.id);
      assert.equal(await page.locator('#global-newswire .source').first().textContent(), catalogues[edition.lang]![0]!.name);
      assert.equal(await page.locator('#global-newswire h3').first().textContent(), publisherHeadline);
      assert.equal(view.mirrorConnections, firstConnectionFailure ? 2 : 1);
      assert.equal(await page.locator('#world-status details').count(), 0, `${edition.lang} has an unexpected source outage`);
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
      if (edition.lang === 'ar') await page.screenshot({path: '.test-output/arabic-desktop.png', fullPage: true});
      await page.setViewportSize({width: 375, height: 900});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${edition.lang} mobile layout overflows`);
      if (edition.lang === 'ar') await page.screenshot({path: '.test-output/arabic-mobile.png', fullPage: true});

      if (edition.lang === 'fr') {
        const sourceId = catalogues.fr![0]!.id;
        await page.locator('#source-picker > summary').click();
        await page.locator(`#source-options input[value="${sourceId}"]`).uncheck();
        assert.equal(await page.locator('#global-newswire article').count(), 0);
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
        assert.equal(await page.locator('#global-newswire article').count(), 0, 'French choices survive reload');
        await page.getByRole('link', {name: 'Español', exact: true}).click();
        await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
        assert.equal(await page.locator('#global-newswire article').count(), 1, 'French choices cannot hide Spanish sources');
        await page.getByRole('link', {name: 'Français', exact: true}).click();
        await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      }
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

test('a localized edition uses its Wikipedia and displays credited Commons illustrations', async () => {
  const browser = await launchBrowser();
  try {
    const {page} = await openEdition(browser, '/', 'fr', {illustrations: 'related'});
    await page.setViewportSize({width: 1280, height: 1000});
    const image = page.locator('#world-news .wire-thumbnail > a > img');
    await image.waitFor();
    assert.equal(await image.getAttribute('alt'), 'Illustration.png');
    const label = french['Image credits'];
    assert.ok(label);
    await page.locator('#world-news').getByRole('button', {name: label}).click();
    const dialog = page.getByRole('dialog', {name: label});
    assert.equal(await dialog.getByRole('link', {name: 'CC BY 4.0'}).getAttribute('href'), 'https://creativecommons.org/licenses/by/4.0/');
    assert.equal(await dialog.getByRole('link', {name: 'Wikimedia Commons'}).getAttribute('href'), 'https://commons.wikimedia.org/wiki/File:Illustration.png');
    await dialog.getByRole('button', {name: french.Close!}).click();
    const utilities = (await page.locator('.footer-utilities').boundingBox())!;
    const notes = (await page.locator('.footer-notes').boundingBox())!;
    const languages = (await page.locator('.edition-switcher').boundingBox())!;
    const provenance = (await page.locator('.source-provenance').boundingBox())!;
    assert.ok(languages.y < notes.y + notes.height && notes.y < languages.y + languages.height);
    assert.ok(provenance.y >= utilities.y + utilities.height - 1);
    const {page: noMatch} = await openEdition(browser, '/', 'fr', {illustrations: 'unrelated'});
    await noMatch.locator('#world-news').getByRole('img', {name: french['No reusable image found for this headline.']!}).waitFor();
    assert.equal(await noMatch.locator('#world-news .wire-thumbnail img').count(), 0);
  } finally { await browser.close(); }
});

test('localized reader shows loading and first-load failure, then retains a collection after refresh failure under the project base path', async () => {
  const browser = await launchBrowser();
  try {
    const first = await openEdition(browser, '/stringer-news/', 'zh', {holdData: true});
    await first.page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'true');
    await first.page.waitForFunction(() => document.querySelector<HTMLElement>('#relay-status')?.hidden === false);
    assert.ok((await first.page.locator('#relay-status-details').textContent())?.includes(chinese['Loading news…']!), 'Loading progress uses the selected locale');
    first.releaseData();
    await first.page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
    assert.equal(await first.page.locator('#global-newswire article').count(), 1);
    assert.equal(await first.page.locator('#global-newswire h3').first().textContent(), publisherHeadline);
    assert.equal(await first.page.locator('#stringer-news article').count(), 1);

    first.stopMirrors();
    await first.page.route('**/stringer-news/data/news.json', route => route.fulfill({status: 503, body: 'Unavailable'}));
    await first.page.clock.fastForward(300_000);
    await first.page.waitForFunction(expected => document.querySelector<HTMLElement>('#refresh-status')?.textContent === expected,
      chinese['The news collection is unavailable. We’ll retry automatically.']!);
    assert.equal(await first.page.locator('#global-newswire article').count(), 1, 'A failed refresh keeps the displayed publisher story');
    assert.equal(await first.page.locator('#stringer-news article').count(), 1, 'A failed refresh keeps Stringer reporting');
    assert.equal(await first.page.locator('html').getAttribute('lang'), 'zh');
    await first.page.close();

    const failed = await openEdition(browser, '/stringer-news/', 'ar', {unavailable: true});
    await failed.page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
    assert.equal(await failed.page.locator('#global-newswire article').count(), 0);
    assert.equal(await failed.page.locator('#world-news .empty').textContent(), arabic['Global headlines are currently unavailable.']);
    assert.equal(await failed.page.locator('#stringer-news article').count(), 0);
    assert.equal(await failed.page.locator('#refresh-status').textContent(), arabic['The news collection is unavailable. We’ll retry automatically.']!);
    assert.equal(await failed.page.locator('html').getAttribute('dir'), 'rtl');
    assert.deepEqual([...failed.errors], []);
    await failed.page.close();
  } finally { await browser.close(); }
});

test('Kiswahili displays DW headlines and keeps its stories through publisher refresh failures', async () => {
  const browser = await launchBrowser();
  const title = 'Habari za leo <img src=x onerror=window.pwned=true>';
  const article = 'https://www.dw.com/sw/habari-za-leo/a-1';
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="sw">
    <entry><title><![CDATA[${title}]]></title>
      <link rel="alternate" hreflang="sw" href="${article}"/>
      <published>2026-11-17T12:00:00Z</published><summary>Publisher summary</summary></entry>
    <entry><title>Habari nyingine</title>
      <link rel="alternate" hreflang="sw" href="https://www.dw.com/sw/habari-nyingine/a-2"/></entry>
    <entry><link rel="alternate" hreflang="sw" href="${article}"/></entry>
    <entry><title>Kiungo kisichoruhusiwa</title><link rel="alternate" hreflang="sw" href="javascript:alert(1)"/></entry>
    <entry><title>Kiungo cha nje</title><link rel="alternate" hreflang="sw" href="https://example.org/sw/a-3"/></entry>
  </feed>`;
  try {
    const {page, errors} = await openEdition(browser, '/pr-preview/61/', 'fr', {builtApp: true});
    let body = atom;
    let status = 200;
    await page.route(swahiliPublisher.url, route => route.fulfill({
      status, body, contentType: 'application/atom+xml',
      headers: {'Access-Control-Allow-Origin': '*'},
    }));
    await page.getByRole('link', {name: 'Kiswahili', exact: true}).click();
    await page.waitForURL('**/pr-preview/61/sw/');
    await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('html').getAttribute('lang'), 'sw');
    assert.equal(await page.locator('#world-title').textContent(), swahili['Global Newswire']);
    assert.deepEqual(await page.locator('#world-news h3').allTextContents(), [title, 'Habari nyingine']);
    assert.equal(await page.locator('#world-news article a').first().getAttribute('href'), article);
    assert.equal(await page.locator('#world-news .source').first().textContent(), 'DW Kiswahili');
    assert.equal(await page.locator('#world-news time').getAttribute('datetime'), '2026-11-17T12:00:00.000Z');
    assert.equal(await page.locator('#world-news img, #world-news .summary').count(), 0);
    assert.equal(await page.locator('#stringer-news h3').textContent(), 'تقرير Stringer 原文报道');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    await page.locator('#source-picker > summary').click();
    const source = page.getByRole('checkbox', {name: 'DW Kiswahili'});
    await source.uncheck();
    assert.equal(await page.locator('#world-news article').count(), 0);
    await source.check();
    assert.equal(await page.locator('#world-news article').count(), 2);

    const failures = [
      [503, 'Unavailable'], [200, '<broken>'], [200, '<feed xml:lang="sw"/>'],
      [200, atom.replace('xml:lang="sw"', 'xml:lang="en"')],
      [200, atom.replace('<feed ', '<other ').replace('</feed>', '</other>')],
      [200, atom.replace('</feed>', '</broken>')],
    ] as const;
    for (const [nextStatus, nextBody] of failures) {
      status = nextStatus;
      body = nextBody;
      const request = page.waitForResponse(swahiliPublisher.url);
      await page.clock.fastForward(300_000);
      await request;
      await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
      assert.match(await page.locator('#world-status').textContent() ?? '', /DW Kiswahili: imeshindwa kusasisha/);
      assert.equal(await page.locator('#world-news h3').first().textContent(), title);
    }
    status = 200;
    body = '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="sw"/>';
    const request = page.waitForResponse(swahiliPublisher.url);
    await page.clock.fastForward(300_000);
    await request;
    await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#world-news article').count(), 0, 'A verified empty feed replaces the previously loaded headlines');
    assert.equal(await page.locator('#world-news .empty').textContent(), swahili['No headlines available in this collection.']);
    assert.doesNotMatch(await page.locator('#world-status').textContent() ?? '', /DW Kiswahili: imeshindwa/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the Kiswahili preview shows checked publisher snapshots with source attribution and collection time', async () => {
  const browser = await launchBrowser();
  const directory = await mkdtemp(join(tmpdir(), 'stringer-swahili-'));
  try {
    const pageFile = join(directory, 'sw.html');
    await writeFile(pageFile, await readFile('_site/sw/index.html'));
    await embedSwahiliHeadlines(pageFile, async (url, options) => {
      const publisher = collectedSwahiliPublishers.find(source => source.url === url)!;
      assert.deepEqual(options?.allowedHosts, [new URL(url).hostname]);
      if (publisher.id === 'sw-voa') throw new Error('Unavailable');
      return `<rss version="2.0"><channel><item>
        <title>Habari kutoka ${publisher.name}</title><link><![CDATA[https://${publisher.articleHosts[0]}/sw/habari?a=1&#038;b=2]]></link>
        <pubDate>Tue, 17 Nov 2026 09:30:00 GMT</pubDate>
        <description>Unapproved publisher copy</description><enclosure url="https://example.org/photo.jpg" type="image/jpeg"/>
      </item><item>
        <title>Unexpected external link</title><link>https://example.org/sw/habari</link>
      </item></channel></rss>`;
    });
    const html = await readFile(pageFile, 'utf8');
    assert.doesNotMatch(html, /Unapproved publisher copy|photo\.jpg|Unexpected external link/);
    const {page, errors} = await openEdition(browser, '/pr-preview/61/', 'fr', {builtApp: true});
    await page.route('**/pr-preview/61/sw/', route => route.fulfill({body: html, contentType: 'text/html'}));
    await page.route(swahiliPublisher.url, route => route.fulfill({status: 503, headers: {'Access-Control-Allow-Origin': '*'}}));
    await page.getByRole('link', {name: 'Kiswahili', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('#world-news')?.getAttribute('aria-busy') === 'false');
    assert.deepEqual(await page.locator('#world-news h3').allTextContents(), [
      'Habari kutoka RFI Kiswahili', 'Habari kutoka HabariLeo', 'Habari kutoka BBC News Swahili',
    ]);
    assert.deepEqual(await page.locator('#world-news .source').allTextContents(), ['RFI Kiswahili', 'HabariLeo', 'BBC News Swahili']);
    assert.match(await page.locator('#relay-status-details').textContent() ?? '', /RFI Kiswahili: habari za toleo hili zilikusanywa/);
    assert.match(await page.locator('#world-status').textContent() ?? '', /VOA Swahili: imeshindwa kusasisha/);
    assert.equal(await page.locator('#source-options input').count(), 5);
    assert.equal(await page.locator('#world-news article a').first().getAttribute('href'), 'https://www.rfi.fr/sw/habari?a=1&b=2');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await rm(directory, {recursive: true, force: true});
  }
});
