import { readerSource } from './reader-source.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../scripts/browser.ts';
import { SOURCES } from '../news-model.ts';
const time = '2026-01-01T00:00:00.000Z';
const snapshot = () => ({
  schemaVersion: 2,
  generatedAt: time,
  sources: Object.fromEntries(
    SOURCES.map(({ id }) => [
      id,
      { stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null },
    ]),
  ),
});
const story = (url = 'https://example.org/story') => ({
  title: 'Synthetic reporting',
  url,
  summary: 'Reporting',
  credits: 'Reporter',
  publishedAt: null,
  image: null,
});
const reader = `export const cachedRelaySnapshot=()=>window.cached;
export async function readRelaySnapshot(config,report,partial,timing){window.readerCalls=(window.readerCalls||0)+1;window.readerCallbacks={report,partial,timing};return new Promise((resolve,reject)=>{window.finish=resolve;window.fail=()=>reject(new Error('Offline'));});}`;
async function setup(t, cached = null, images = true, {withoutLabels = false, missingMenu = false} = {}) {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const pageError = missingMenu ? page.waitForEvent('pageerror') : null;
  await page.clock.install();
  await page.addInitScript((value) => {
    window.cached = value;
  }, cached);
  await page.route('https://reader.test/**', async (route) => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    if (file === 'relay-reader.js')
      return route.fulfill({ contentType: 'text/javascript', body: reader });
    if (file === 'relay-config.js')
      return route.fulfill({
        contentType: 'text/javascript',
        body: 'export default {enabled:true};',
      });
    if (file.startsWith('assets/')) return route.abort();
    let body = file.endsWith('.js') ? await readerSource(file, source => {
      if (file !== 'news-model.js') return source;
      if (!images) source = source.replace("images: source.id === 'stringer'", 'images: false');
      if (withoutLabels) source = source.replace(/linkLabel: '[^']*', /g, '');
      return source;
    }) : await readFile(new URL('../' + file, import.meta.url), 'utf8');
    if (file === 'index.html' && missingMenu) body = body.replace('class="header-menu-toggle"', 'class="missing-menu"');
    return route.fulfill({
      contentType: file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : 'text/html',
      body,
    });
  });
  await page.route('https://example.org/**', (route) => route.abort());
  await page.goto('https://reader.test/');
  if (pageError) { assert.match((await pageError).message, /Missing reader element: .header-menu-toggle/); return page; }
  await page.waitForFunction(() => window.finish);
  return page;
}
test('paused collections provide publisher links and honest empty reporting state', async (t) => {
  const page = await setup(t);
  await page.evaluate((value) => window.finish(value), snapshot());
  await page.waitForFunction(
    () => document.querySelector('#world-news').getAttribute('aria-busy') === 'false',
  );
  assert.match(
    await page.locator('#world-news').textContent(),
    /Global headlines are currently unavailable/,
  );
  assert.equal(await page.locator('.publisher-links a').count(), 5);
  assert.equal(
    await page.locator('.publisher-links a').nth(3).getAttribute('href'),
    'https://www.dw.com/',
  );
  assert.match(await page.locator('#stringer-news').textContent(), /currently unavailable/);
});
test('progress timings, partial updates and failures retain displayed stories', async (t) => {
  const cached = snapshot();
  cached.sources.stringer = {
    ...cached.sources.stringer,
    status: 'success',
    lastSuccessAt: time,
    stories: [story(), story('https://example.org/second')],
  };
  const page = await setup(t, cached);
  await page.evaluate(() => window.readerCallbacks.report('Loading test stories…'));
  await page.evaluate(() => {
    const now = performance.now();
    window.readerCallbacks.timing({
      bbc: { startedAt: now, durationMs: null, state: 'loading', received: 1, total: 2 },
      nyt: { startedAt: now, durationMs: 100, state: 'loaded', received: 2, total: 2 },
      dw: { startedAt: now, durationMs: null, state: 'empty', received: 0, total: 0 },
      cna: { startedAt: now, durationMs: 100, state: 'partial', received: 1, total: 3 },
    });
  });
  assert.match(await page.locator('#relay-status-details').textContent(), /1\/2 stories/);
  assert.match(await page.locator('#relay-status-details').textContent(), /no published stories/);
  const partial = structuredClone(cached);
  partial.sources.stringer.stories = [];
  partial.sources.bbc = {
    ...partial.sources.bbc,
    stories: [story('https://example.org/headline')],
    status: 'failure',
    error: 'Offline',
    unavailable: 1,
    pending: 2,
  };
  await page.evaluate((value) => window.readerCallbacks.partial(value), partial);
  assert.equal(await page.locator('#stringer-news article').count(), 2);
  await page.evaluate((value) => window.readerCallbacks.partial(value), {
    ...partial,
    generatedAt: '2025-01-01T00:00:00.000Z',
  });
  assert.equal(await page.locator('#stringer-news article').count(), 2);
  await page.evaluate(() => window.fail());
  await page.waitForFunction(
    () => document.querySelector('#world-news').getAttribute('aria-busy') === 'false',
  );
  assert.match(await page.locator('#refresh-status').textContent(), /previously loaded/);
  assert.match(await page.locator('#relay-status-details').textContent(), /1 unavailable/);
  assert.match(await page.locator('#relay-status-details').textContent(), /2 queued/);
  assert.match(await page.locator('#relay-status-details').textContent(), /stories received after/);
});
test('relay UI ignores unsafe links and retains image attribution', async (t) => {
  const page = await setup(t, null, false);
  const value = snapshot();
  value.sources.stringer = {
    ...value.sources.stringer,
    status: 'success',
    lastSuccessAt: time,
    stories: [
      story('javascript:bad'),
      {
        ...story(),
        image: { url: 'https://example.org/photo', alt: 'Photo', credit: 'Photographer' },
      },
    ],
  };
  await page.evaluate((value) => window.readerCallbacks.partial(value), value);
  assert.equal(await page.locator('#stringer-news article').count(), 1);
  assert.equal(await page.locator('figcaption').textContent(), 'Photographer');
  await page.evaluate((value) => window.finish(value), value);
});
test('older final snapshots are rejected and do not erase cached stories', async (t) => {
  const cached = snapshot();
  const page = await setup(t, cached);
  await page.evaluate((value) => window.finish(value), {
    ...cached,
    generatedAt: '2025-01-01T00:00:00.000Z',
  });
  await page.waitForFunction(
    () => document.querySelector('#world-news').getAttribute('aria-busy') === 'false',
  );
  assert.match(await page.locator('#refresh-status').textContent(), /previously loaded/);
});
test('polling cannot start a second relay request while the current load is pending', async t => {
  const page = await setup(t);
  await page.clock.fastForward(300_000);
  assert.equal(await page.evaluate(() => window.readerCalls), 1);
  assert.equal(await page.locator('#world-news').getAttribute('aria-busy'), 'true');
  await page.evaluate(value => window.finish(value), snapshot());
  await page.waitForFunction(() => document.querySelector('#world-news').getAttribute('aria-busy') === 'false');
  await page.clock.fastForward(300_000);
  await page.waitForFunction(() => window.readerCalls === 2);
  await page.evaluate(value => window.finish(value), snapshot());
  await page.waitForFunction(() => document.querySelector('#world-news').getAttribute('aria-busy') === 'false');
});
test('missing required navigation markup fails visibly', async t => {
  await setup(t, null, true, {missingMenu: true});
});
test('publisher links use source names when no separate link label is configured', async t => {
  const page = await setup(t, null, true, {withoutLabels: true});
  await page.evaluate(value => window.finish(value), snapshot());
  await page.waitForFunction(() => document.querySelector('#world-news').getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('.publisher-links a').first().textContent(), 'BBC World');
});
test('retained stories without a collection time do not invent a timestamp', async t => {
  const cached=snapshot();cached.sources.stringer={...cached.sources.stringer,status:'failure',error:'Unavailable',stories:[story()]};
  const page=await setup(t,cached);const partial=snapshot();partial.sources.stringer={...partial.sources.stringer,status:'failure',error:'Unavailable'};
  await page.evaluate(value=>window.readerCallbacks.partial(value),partial);
  assert.match(await page.locator('#relay-status-details').textContent(),/Showing 1 previously collected stories\./);
  await page.evaluate(value=>window.finish(value),partial);
});
