import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGLISH_ATOMSTR_SOURCES, withEnglishAtomstrFallback } from '../english-atomstr.ts';
import { NEWSWIRE_LIMIT, SOURCES } from '../news-model.ts';
import type { SourceState, Story } from '../relay/types.ts';

const now = Date.parse('2026-11-25T09:00:00Z');
const current = new Date(now).toISOString();
const stale = '2026-11-23T09:00:00Z';
const future = '2026-11-25T09:01:00Z';
const story = (url: string, publishedAt: string | null = current): Story =>
  ({ title: 'Example headline', url, publishedAt, summary: '', image: null });
const source = (stories: Story[], status: SourceState['status'] = 'success', unavailable?: number): SourceState =>
  ({ stories, status, attemptedAt: current, lastSuccessAt: current, error: null,
    ...(unavailable === undefined ? {} : { unavailable }) });
const cached = (stories: Story[], lastSuccessAt: string | null = current) => ({ stories, lastSuccessAt });

test('the pilot pins Al Jazeera and DW to the same publisher RSS feeds', () => {
  assert.deepEqual(ENGLISH_ATOMSTR_SOURCES.map(entry => entry.id), ['aljazeera', 'dw']);
  for (const entry of ENGLISH_ATOMSTR_SOURCES) {
    assert.equal(entry.feeds[0]?.url, SOURCES.find(s => s.id === entry.id)?.url);
    assert.match(entry.feeds[0]?.pubkey ?? '', /^[a-f0-9]{64}$/);
  }
});

test('fallback fills signed collection gaps within the per-publisher cap and retains primary URLs', () => {
  const original = story('https://www.aljazeera.com/news/example?traffic_source=rss');
  const extra = story('https://www.aljazeera.com/news/second');
  const third = story('https://www.aljazeera.com/news/third');
  const displayed = { aljazeera: source([original]) };
  const embedded = { aljazeera: cached([story('https://www.aljazeera.com/news/example#top'), extra,
    story(extra.url + '#top'), third]) };
  assert.deepEqual(withEnglishAtomstrFallback(displayed, { aljazeera: source([], 'success', 1) }, embedded, now).aljazeera?.stories,
    [original, extra]);
  assert.deepEqual(withEnglishAtomstrFallback(displayed, { aljazeera: source([], 'success', 2) }, embedded, now).aljazeera?.stories,
    [original, extra, third]);
  assert.deepEqual(withEnglishAtomstrFallback(displayed, { aljazeera: source([], 'failure') }, embedded, now).aljazeera?.stories,
    [original, extra, third]);
  assert.deepEqual(displayed.aljazeera.stories, [original]);
  const full = { aljazeera: source(Array.from({ length: NEWSWIRE_LIMIT }, (_, index) => story(`https://example.org/${index}`))) };
  assert.deepEqual(withEnglishAtomstrFallback(full, {}, embedded, now), full);
});

test('DW fallback deduplicates changed headline slugs by article ID', () => {
  const original = { ...story('https://www.dw.com/en/egypt-at-least-31-dead-after-fuel-truck-overturns-on-highway/a-80055175?maca=en-rss-en-all-1573-rdf'),
    title: 'Egypt: At least 31 dead after fuel truck overturns on highway' };
  const mirror = { ...story('https://www.dw.com/en/egypt-at-least-30-dead-after-fuel-truck-overturns-on-highway/a-80055175?maca=en-rss-en-all-1573-rdf'),
    title: 'Egypt: At least 30 dead after fuel truck overturns on highway', atomstr: true };
  const differentArticle = { ...mirror, url: 'https://www.dw.com/en/another-story/a-80055176' };
  const embedded = { dw: cached([mirror, differentArticle]) };

  assert.deepEqual(withEnglishAtomstrFallback({ dw: source([original]) }, { dw: source([original], 'success', 1) }, embedded, now).dw?.stories,
    [original, differentArticle]);
  assert.deepEqual(withEnglishAtomstrFallback({}, {}, { dw: cached([mirror, original, differentArticle]) }, now).dw?.stories,
    [mirror, differentArticle]);
});

test('fallback ignores complete, paused and loading sources and caches outside the freshness window', () => {
  const entry = story('https://www.dw.com/en/example');
  const displayed = { dw: source([]) };
  for (const live of [source([]), source([], 'paused'), source([], 'loading')]) {
    assert.deepEqual(withEnglishAtomstrFallback(displayed, { dw: live }, { dw: cached([entry]) }, now), displayed);
  }
  for (const date of [null, stale, future]) {
    assert.deepEqual(withEnglishAtomstrFallback({}, {}, { dw: cached([entry], date) }, now), {});
  }
  assert.deepEqual(withEnglishAtomstrFallback({}, {}, { dw: cached([
    story(entry.url, null), story(entry.url, stale), story(entry.url, future),
  ]) }, now), {});
  const fromCache = withEnglishAtomstrFallback({}, {}, { dw: cached([entry]), bbc: cached([entry]) }, now);
  assert.deepEqual(Object.keys(fromCache), ['dw']);
  assert.equal(fromCache.dw?.status, 'failure');
  assert.deepEqual(fromCache.dw?.stories, [entry]);
});
