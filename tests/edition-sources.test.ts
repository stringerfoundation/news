import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeEvent, generateSecretKey, getPublicKey, type EventTemplate } from 'nostr-tools';
import { EDITION_SOURCES, sourcesForLocale } from '../edition-sources.ts';
import { parseAtomstrEvent } from '../relay/atomstr-reader.ts';
import type { AtomstrSource } from '../relay/types.ts';
import { safeUrl } from '../news-model.ts';

const localizedEditions = ['fr', 'es', 'ar', 'zh', 'ru', 'nl', 'de'] as const;

test('each localized edition has a distinct, safe catalogue with pinned feed identities', () => {
  for (const locale of localizedEditions) {
    const sources = EDITION_SOURCES[locale];
    assert.ok(sources && sources.length > 0, `${locale} catalogue is not empty`);

    const ids = new Set<string>();
    const feedPairs = new Set<string>();
    for (const source of sources) {
      assert.ok(source.id.startsWith(`${locale}-`), `${source.id} has the ${locale} prefix`);
      assert.ok(!ids.has(source.id), `${locale} has no duplicate source ID: ${source.id}`);
      ids.add(source.id);
      assert.ok(source.name.trim(), `${source.id} has a name`);
      assert.ok(safeUrl(source.homepage), `${source.id} has a safe homepage`);
      assert.ok(source.feeds.length > 0, `${source.id} has at least one pinned feed`);

      for (const feed of source.feeds) {
        assert.ok(safeUrl(feed.url), `${source.id} has a safe feed URL: ${feed.url}`);
        assert.match(feed.pubkey, /^[0-9a-f]{64}$/, `${source.id} has a valid pinned public key`);
        const pair = `${feed.url}\0${feed.pubkey}`;
        assert.ok(!feedPairs.has(pair), `${locale} has no duplicate URL/key pair: ${feed.url}`);
        feedPairs.add(pair);
      }
    }
  }
});

test('Portuguese editions share one catalogue and unsupported languages do not inherit another edition', () => {
  assert.strictEqual(EDITION_SOURCES['pt-BR'], EDITION_SOURCES['pt-PT']);
  assert.strictEqual(sourcesForLocale('pt-BR'), sourcesForLocale('pt-PT'));
  assert.deepEqual(sourcesForLocale('en'), []);
  assert.deepEqual(sourcesForLocale('en-GB'), []);
  assert.deepEqual(sourcesForLocale('xx-ZZ'), []);
  assert.deepEqual(sourcesForLocale('xx'), []);
  assert.strictEqual(sourcesForLocale('de-AT'), EDITION_SOURCES.de);
  assert.strictEqual(sourcesForLocale('fr-CA'), EDITION_SOURCES.fr);
});

test('a signed publication is tied to its pinned source feed and unsafe original links are rejected', () => {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const russianFeed = {url: 'https://ru.example.test/feed', pubkey};
  const germanFeed = {url: 'https://de.example.test/feed', pubkey};
  const russianSource: AtomstrSource = {id: 'ru-synthetic', name: 'Synthetic Russian source', feeds: [russianFeed]};
  const germanSource: AtomstrSource = {id: 'de-synthetic', name: 'Synthetic German source', feeds: [germanFeed]};
  const now = Date.parse('2026-10-19T12:00:00.000Z');
  const signedNote = (originalUrl: string, feedUrl = russianFeed.url) => finalizeEvent({
    kind: 1,
    created_at: Math.floor(now / 1000) - 30,
    tags: [['proxy', `${feedUrl}#${encodeURIComponent(originalUrl)}`, 'rss']],
    content: 'Synthetic original-language headline',
  } satisfies EventTemplate, secret);

  const valid = signedNote('https://news.example.test/story');
  assert.ok(parseAtomstrEvent(valid, russianSource, now));
  assert.equal(parseAtomstrEvent(valid, germanSource, now), null, 'a note for the Russian feed cannot be reused for the German source');

  const unsafe = signedNote('javascript:alert(1)');
  assert.equal(parseAtomstrEvent(unsafe, russianSource, now), null);
});
