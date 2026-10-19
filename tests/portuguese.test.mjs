import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { PORTUGUESE_SOURCES, ATOMSTR_RELAY } from '../portuguese-sources.js';
import { parseAtomstrEvent, readPortugueseSources, cachedPortugueseSources } from '../relay/portuguese-reader.js';
import { translator, localeForLanguage } from '../reader-locales.js';
import { localizedReaderHtml } from '../scripts/reader-html.mjs';
import { worldGroups, safeUrl, formatLocalDateTime, formatPublicationDate } from '../news-model.js';
import { load } from 'cheerio';

const secret = generateSecretKey(), pubkey = getPublicKey(secret);
const now = Date.parse('2026-10-16T12:00:00.000Z');
const source = {id: 'pt-synthetic', name: 'Fonte de teste', feeds: [{url: 'https://example.org/feed', pubkey}]};
const event = (options = {}, key = secret) => finalizeEvent({kind: 1, created_at: now / 1000 - 30,
  tags: [['proxy', source.feeds[0].url + '#' + encodeURIComponent('https://example.org/report?q=1#section'), 'rss']],
  content: 'Manchete original — ação e ciência\n\nResumo que nunca deve aparecer.\n\nhttps://images.example.org/photo.jpg\n\nhttps://example.org/report', ...options}, key);

test('Portuguese editions share the complete pinned source catalogue, including specialized and institutional feeds', () => {
  assert.equal(PORTUGUESE_SOURCES.length, 98);
  assert.equal(ATOMSTR_RELAY, 'wss://nostr.data.haus');
  assert.equal(new Set(PORTUGUESE_SOURCES.map(source => source.id)).size, PORTUGUESE_SOURCES.length);
  const keys = PORTUGUESE_SOURCES.flatMap(source => source.feeds.map(feed => feed.pubkey));
  assert.equal(new Set(keys).size, keys.length);
  for (const source of PORTUGUESE_SOURCES) {
    assert.ok(source.name && source.feeds.length);
    assert.ok(safeUrl(source.homepage));
    for (const feed of source.feeds) { assert.ok(safeUrl(feed.url)); assert.match(feed.pubkey, /^[0-9a-f]{64}$/); }
  }
  for (const id of ['pt-cnnbrasil', 'pt-observador', 'pt-fapesp', 'pt-gazetaesportiva', 'pt-phvox'])
    assert.ok(PORTUGUESE_SOURCES.some(source => source.id === id));
});

test('Atomstr extraction verifies pinned identity and feed provenance, strips summaries/images, and keeps original Unicode titles', () => {
  const note = event();
  const story = parseAtomstrEvent(note, source, now);
  assert.equal(story.title, 'Manchete original — ação e ciência');
  assert.equal(story.url, 'https://example.org/report?q=1#section');
  assert.equal(story.summary, ''); assert.equal(story.image, null);
  assert.equal(story.publishedAt, new Date((now / 1000 - 30) * 1000).toISOString());
  assert.equal(story.atomstr, true);
  assert.equal(parseAtomstrEvent(event({}, generateSecretKey()), source, now), null);
  const forged = JSON.parse(JSON.stringify({...note, content: 'Texto adulterado'}));
  assert.equal(parseAtomstrEvent(forged, source, now), null);
  for (const overrides of [
    {kind: 7}, {created_at: now / 1000 + 120}, {content: '\nNo headline'},
    {tags: [['proxy', 'https://wrong.example/feed#https%3A%2F%2Fexample.org', 'rss']]},
    {tags: [['proxy', source.feeds[0].url + '#javascript%3Aalert(1)', 'rss']]},
    {tags: [['proxy', source.feeds[0].url + '#%invalid', 'rss']]},
  ]) assert.equal(parseAtomstrEvent(event(overrides), source, now), null);
});

test('untrusted remote markup stays literal text and cannot select an image enclosure as the original URL', () => {
  const story = parseAtomstrEvent(event({content: '<img src=x onerror=alert(1)>\n\nhttps://images.example.org/photo.jpg'}), source, now);
  assert.equal(story.title, '<img src=x onerror=alert(1)>');
  assert.equal(story.url, 'https://example.org/report?q=1#section');
  assert.equal(story.image, null);
});

test('mirror queries are bounded, recover verified cache on outages, and never invent a successful check', async () => {
  const storage = new Map();
  globalThis.localStorage = {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)};
  try {
    let reads = 0, updates = 0;
    const fresh = await readPortugueseSources({sources: [source], now: () => now, query: async filter => {
      reads++; assert.deepEqual(filter.authors, [pubkey]); assert.equal(filter.limit, 30); return [event()];
    }, onUpdate() {updates++;}});
    assert.equal(reads, 1); assert.equal(updates, 1);
    assert.equal(fresh[source.id].status, 'success');
    const cached = cachedPortugueseSources([source], now + 1000);
    assert.equal(cached[source.id].stories[0].title, fresh[source.id].stories[0].title);
    const failed = await readPortugueseSources({sources: [source], now: () => now + 2000, query: async () => {throw Error('Offline');}});
    assert.equal(failed[source.id].status, 'failure');
    assert.equal(failed[source.id].lastSuccessAt, fresh[source.id].lastSuccessAt);
    assert.equal(failed[source.id].stories.length, 1);
    storage.clear();
    const empty = await readPortugueseSources({sources: [source], now: () => now, query: async () => []});
    assert.equal(empty[source.id].status, 'failure');
    assert.equal(empty[source.id].lastSuccessAt, null);
    storage.set('stringer-atomstr-v1:' + source.id, JSON.stringify({checkedAt: new Date(now).toISOString(), events: [{...event(), content: 'forged'}]}));
    assert.equal(cachedPortugueseSources([source], now)[source.id].stories.length, 0);
  } finally { delete globalThis.localStorage; }
});

test('publisher RSS is preferred over social aliases and edition grouping uses the supplied registry', async () => {
  const socialSecret = generateSecretKey();
  const mixed = {...source, feeds: [...source.feeds, {url: 'https://bsky.app/profile/example.org/rss', pubkey: getPublicKey(socialSecret), social: 'Bluesky'}]};
  const social = event({tags: [['proxy', mixed.feeds[1].url + '#' + encodeURIComponent('https://bsky.app/profile/example.org/post/1'), 'rss']]}, socialSecret);
  const query = async () => [social, event()];
  const result = await readPortugueseSources({sources: [mixed], query, now: () => now, previous: {}});
  assert.equal(result[source.id].stories.length, 1);
  assert.equal(result[source.id].stories[0].mirroredVia, undefined);
  const snapshot = {sources: result};
  assert.equal(worldGroups(snapshot, [source.id], [source])[0].source, source.name);
  assert.deepEqual(worldGroups(snapshot, [], [source]), []);
  const fallback = await readPortugueseSources({sources: [mixed], query: async () => [social], now: () => now, previous: {}});
  assert.equal(fallback[source.id].stories[0].mirroredVia, 'Bluesky');
});

test('Portuguese pages use relative shared assets, distinct language variants, and the same source count', () => {
  const html = readFileSync('index.html', 'utf8');
  for (const locale of ['pt-BR', 'pt-PT']) {
    const $ = load(localizedReaderHtml(html, locale));
    assert.equal($('html').attr('lang'), locale);
    assert.equal($('#world-title').text(), 'Notícias em português');
    assert.equal($('script[type="module"]').attr('src'), '../app.js');
    assert.equal($('.edition-switcher [aria-current="page"]').attr('hreflang'), locale);
    assert.equal($('.edition-switcher a').first().attr('href'), '../');
    assert.equal($('#source-count').text(), '98 de 98 ativas');
    assert.equal($('.source-help').text(), translator(locale)('Your choices are saved in this browser.'));
    assert.match($('.source-provenance').text(), /Espelhos do Atomstr/);
    assert.equal($('meta[name="description"]').attr('content').includes('portuguesa'), true);
    const date = new Date('2026-10-16T10:45:00Z');
    const expected = new Intl.DateTimeFormat(locale, {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZoneName:'short'}).format(date);
    assert.equal(formatLocalDateTime(date, locale), expected);
    assert.ok(formatPublicationDate('2026-10-16', locale).includes('2026'));
  }
  assert.equal(localeForLanguage('en'), 'en-US');
  assert.equal(translator('pt-BR')('Donate now'), 'Doe agora');
  assert.equal(translator('pt-PT')('Donate now'), 'Faça um donativo');
});

test('staging retains the deployment robots block and uses the two canonical Portuguese routes', () => {
  assert.equal(readFileSync('_site/robots.txt', 'utf8'), 'User-agent: *\nDisallow: /\n');
  const html = load(readFileSync('index.html', 'utf8'));
  assert.equal(html('.edition-switcher [hreflang="pt-BR"]').attr('href'), './br/');
  assert.equal(html('.edition-switcher [hreflang="pt-PT"]').attr('href'), './pt/');
});
