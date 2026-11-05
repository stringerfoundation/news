import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {readerSource} from './reader-source.ts';
import {launchBrowser} from '../scripts/browser.ts';
import {EDITION_SOURCES} from '../edition-sources.ts';
import {SOURCES} from '../news-model.ts';
import {STRINGER_MEDIA} from '../stringer-media.ts';
import {translator} from '../reader-locales.ts';

const at = '2026-10-19T12:00:00.000Z';
const story = (title = 'Original publisher headline') => ({title, url: 'https://publisher.example/story', publishedAt: at, summary: '', image: null, atomstr: true});
const entry = (stories = [], status = 'success') => ({stories, status, attemptedAt: at, lastSuccessAt: stories.length ? at : null, error: status === 'failure' ? 'Offline' : null});
const collection = () => ({schemaVersion: 2, generatedAt: at, sources: Object.fromEntries(SOURCES.map(source => [source.id, entry()]))});
const mirrors = `export function cachedAtomstrSources(sources) {
  if (window.cacheThrows) throw new Error('Unavailable storage');
  return Object.fromEntries(sources.map(source => [source.id, window.mirrorCache?.[source.id] || {stories:[],status:'failure',attemptedAt:${JSON.stringify(at)},lastSuccessAt:null,error:'Checking'}]));
}
export async function readAtomstrSources({sources,previous,onUpdate}) {
  window.mirrorCalls=(window.mirrorCalls||0)+1; window.previousMirrors=previous;
  window.emitMirror=onUpdate;
  return new Promise((resolve,reject)=>{
    window.finishMirrors=(entries)=>{for (const source of sources) onUpdate(source.id,entries[source.id] || previous[source.id]); resolve(entries);};
    window.rejectMirrors=()=>reject(new Error('Offline'));
  });
}`;
const relay = `export const cachedRelaySnapshot=()=>window.cachedCollection || null;
export async function readRelaySnapshot() {return new Promise((resolve,reject)=>{window.finishStringer=resolve;window.failStringer=()=>reject(new Error('Offline'));});}`;

async function setup(t, locale, options = {}) {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 375, height: 900}});
  await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(options => {
    Object.assign(window, options);
    if (options.saved !== undefined) localStorage.setItem(`stringer-disabled-sources-${options.locale.startsWith('pt-') ? 'pt' : options.locale}-v1`, options.saved);
    if (options.storageDenied) Object.defineProperty(window, 'localStorage', {get() {throw new Error('Storage unavailable');}});
  }, {...options, locale});
  let failStatic = options.failStatic;
  const assets = [];
  await page.route('https://locales.test/**', async route => {
    const path = new URL(route.request().url()).pathname.slice(1);
    const file = path.endsWith('/') ? `${path}index.html` : path;
    if (file.startsWith('assets/')) {assets.push(file); return route.abort();}
    if (file === 'atomstr-reader.js') return route.fulfill({contentType: 'text/javascript', body: mirrors});
    if (file === 'relay-reader.js') return route.fulfill({contentType: 'text/javascript', body: relay});
    if (file === 'relay-config.js') return route.fulfill({contentType: 'text/javascript', body: `export default {enabled:${Boolean(options.relay)}};`});
    if (file === 'data/news.json') return failStatic ? route.fulfill({status: 503}) : route.fulfill({json: collection()});
    let body = file.endsWith('.js') ? await readerSource(file) : await readFile(`_site/${file}`, 'utf8');
    if (file.endsWith('index.html') && options.proxy) body = body.replace('<head>', '<head><base href="/news-assets/">');
    if (file.endsWith('index.html') && options.omitOptions) body = body.replace('id="source-options"', 'id="unavailable-options"');
    return route.fulfill({contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body});
  });
  const path = locale === 'pt-BR' ? 'br' : locale === 'pt-PT' ? 'pt' : locale;
  await page.goto(`https://locales.test/${path}/`);
  return {page, errors, assets, failStatic() {failStatic = true;}};
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('#world-news').getAttribute('aria-busy') === 'false');
}
async function finish(page, locale, states = {}) {
  const values = Object.fromEntries(EDITION_SOURCES[locale].map(source => [source.id, states[source.id] || entry()]));
  await page.waitForFunction(() => window.finishMirrors);
  await page.evaluate(values => window.finishMirrors(values), values);
}

test('Portuguese source search, persistence and enable-all remain usable with cached headlines', async t => {
  const locale = 'pt-BR', first = EDITION_SOURCES[locale][0], second = EDITION_SOURCES[locale][1], tr = translator(locale);
  const {page, errors} = await setup(t, locale, {saved: JSON.stringify([second.id, 'unknown-source']), mirrorCache: {[first.id]: entry([story()], 'failure')}});
  await page.waitForFunction(() => window.finishMirrors);
  assert.equal(await page.locator('#world-news h3').first().textContent(), 'Original publisher headline');
  await page.locator('#source-picker > summary').click();
  assert.equal(await page.locator(`#source-options input[value="${second.id}"]`).isChecked(), false);
  await page.locator('#source-search').fill('nonexistent publisher');
  assert.equal(await page.locator('#no-matching-sources').isVisible(), true);
  await page.locator('#source-search').fill(first.name);
  assert.equal(await page.locator('#no-matching-sources').isVisible(), false);
  await page.evaluate(() => {const label=document.querySelector('#source-options label'); for(const node of [...label.childNodes]) if(node.nodeType===Node.TEXT_NODE) node.remove();});
  await page.locator('#source-search').fill('');
  await finish(page, locale, {[first.id]: entry([story()])});
  await ready(page);
  await page.evaluate(() => {for (const input of document.querySelectorAll('#source-options input:checked')) input.click();});
  assert.equal(await page.locator('#world-news .empty').textContent(), tr('No sources selected.'));
  await page.locator('.enable-all-empty').click();
  assert.equal(await page.locator('#source-options input:checked').count(), EDITION_SOURCES[locale].length);
  assert.equal(await page.locator('#enable-all-sources').isDisabled(), true);
  await page.locator(`#source-options input[value="${first.id}"]`).uncheck();
  await page.locator(`#source-options input[value="${first.id}"]`).check();
  await page.locator(`#source-options input[value="${first.id}"]`).uncheck();
  await page.locator('#enable-all-sources').click();
  assert.equal(await page.locator('#world-news h3').first().textContent(), 'Original publisher headline');
  assert.deepEqual(errors, []);
});

test('localized polling retains stories on failures, serializes loads and reports partial publisher availability', async t => {
  const locale = 'fr', first = EDITION_SOURCES.fr[0], second = EDITION_SOURCES.fr[1], tr = translator(locale);
  const cached = collection(); cached.sources.stringer = entry([{...story('Cached Stringer reporting'), atomstr: false}]);
  const {page, errors} = await setup(t, locale, {relay: true, cachedCollection: cached, saved: 'invalid-json'});
  await page.waitForFunction(() => window.finishStringer && window.finishMirrors);
  assert.equal(await page.locator('#stringer-news h3').textContent(), 'Cached Stringer reporting');
  await page.clock.fastForward(300_000);
  assert.equal(await page.evaluate(() => window.mirrorCalls), 1);
  await page.evaluate(({id, value}) => window.emitMirror(id, value), {id: first.id, value: entry([{...story(), mirroredVia: 'Bluesky'}])});
  await page.clock.fastForward(200);
  assert.equal(await page.locator('#world-news h3').first().textContent(), 'Original publisher headline');
  assert.equal(await page.locator('.mirror-provenance').textContent(), tr('via {network} / Atomstr', {network: 'Bluesky'}));
  await finish(page, locale, {[first.id]: entry([story()]), [second.id]: entry([], 'failure')});
  await page.evaluate(value => window.finishStringer(value), cached);
  await ready(page);
  assert.ok((await page.locator('#relay-status summary').textContent()).includes(tr('Partial')));
  await page.clock.fastForward(300_000);
  await page.waitForFunction(() => window.mirrorCalls === 2);
  await page.evaluate(() => {window.failStringer();window.rejectMirrors();});
  await ready(page);
  assert.equal(await page.locator('#world-news h3').first().textContent(), 'Original publisher headline');
  assert.deepEqual(errors, []);
});

test('localized initial outages, denied preferences and import initialization failures remain honest', async t => {
  const locale = 'es', tr = translator(locale);
  const {page, errors} = await setup(t, locale, {storageDenied: true, failStatic: true, saved: '17'});
  await finish(page, locale, Object.fromEntries(EDITION_SOURCES.es.map(source => [source.id, entry([], 'failure')])));
  await ready(page);
  assert.equal(await page.locator('#refresh-status').textContent(), tr('The news collection is unavailable. We’ll retry automatically.'));
  await page.locator('#source-picker > summary').click();
  await page.locator('#source-options input').first().uncheck();
  await page.locator('#enable-all-sources').click();
  assert.equal(await page.locator('#world-news article').count(), 0);
  assert.deepEqual(errors, []);
  const failed = await setup(t, 'ar', {cacheThrows: true});
  await ready(failed.page);
  assert.equal(await failed.page.locator('#refresh-status').textContent(), translator('ar')('The news collection is unavailable. We’ll retry automatically.'));
  assert.equal(await failed.page.locator('html').getAttribute('dir'), 'rtl');
  assert.deepEqual(failed.errors, []);
});

test('localized fully successful relay collections and fallback preferences keep each catalogue isolated', async t => {
  const locale = 'de';
  const {page, errors, assets} = await setup(t, locale, {relay: true, saved: JSON.stringify(['unknown', 17])});
  await page.waitForFunction(() => window.finishStringer && window.finishMirrors);
  await finish(page, locale);
  const approved = [...STRINGER_MEDIA][0];
  const reporting = collection(); reporting.sources.stringer = entry([{...story('Approved reporting'), url: approved[0], publishedAt: null, atomstr: false}]);
  await page.evaluate(value => window.finishStringer(value), reporting);
  await ready(page);
  assert.ok((await page.locator('#relay-status summary').textContent()).includes(translator(locale)('Loaded')));
  assert.equal(await page.locator('#source-search').isVisible(), false);
  await page.waitForFunction(() => document.querySelector('#stringer-news .story-placeholder'));
  assert.ok(assets.includes(approved[1].image.replace('./', '')));
  assert.equal(await page.locator('#source-options input:checked').count(), EDITION_SOURCES.de.length);
  assert.deepEqual(errors, []);
});


test('the homepage proxy hides locale navigation and a missing optional options list does not break a refresh', async t => {
  const {page, errors} = await setup(t, 'fr', {proxy: true, omitOptions: true});
  await finish(page, 'fr');
  await ready(page);
  assert.equal(await page.locator('.edition-switcher').isVisible(), false);
  assert.equal(await page.locator('#source-options').count(), 0);
  assert.equal(await page.locator('#refresh-status').textContent(), '');
  assert.deepEqual(errors, []);
});
