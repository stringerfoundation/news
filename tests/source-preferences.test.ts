import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCES, validateSnapshot, worldStories, worldGroups, applyContentPermissions } from '../news-model.ts';
import { collect, parseFeed } from '../scripts/collect.ts';

import type { Snapshot, Story } from '../relay/types.js';

const time = '2026-09-10T11:00:00.000Z';
const makeSnapshot = (): Snapshot => ({ schemaVersion: 2, generatedAt: time,
  sources: Object.fromEntries(SOURCES.map(source => [source.id, {
    stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null,
  }])) });
const story = (url: string, publishedAt = time): Story => ({ title: 'Synthetic headline', url, publishedAt, summary: '', image: null });
function add(snapshot: Snapshot, source: string, stories: Story[]) {
  snapshot.sources[source] = { stories, attemptedAt: time, lastSuccessAt: time, status: 'success', error: null };
}
const cna = readFileSync(new URL('./fixtures/cna.xml', import.meta.url), 'utf8');

test('CNA RSS parses dates and deduplicates; rejects unsafe links', () => {
  const stories = parseFeed(cna);
  assert.equal(stories.length, 30);
  assert.equal(stories[0]!.publishedAt, '2026-09-10T10:31:00.000Z');
  assert.equal(new Set(stories.map(story => story.url)).size, 30);
  assert.throws(() => parseFeed(cna.replace('https://www.channelnewsasia.com/world/synthetic-0', 'javascript:alert(1)')));
});

test('selection precedes deduplication and grouping and recomputes primary links and time', () => {
  const snapshot = makeSnapshot();
  add(snapshot, 'bbc', [{ ...story('https://example.org/shared', '2026-09-10T08:00:00.000Z'), clusterId: 'group' }]);
  add(snapshot, 'cna', [{ ...story('https://example.org/shared', '2026-09-10T08:00:00.000Z'), clusterId: 'group' }]);
  add(snapshot, 'nyt', [{ ...story('https://example.org/nyt', '2026-09-10T10:00:00.000Z'), clusterId: 'group' }]);
  add(snapshot, 'dw', [story('https://example.org/solo', '2026-09-10T09:00:00.000Z')]);
  assert.equal(worldGroups(snapshot)[0]!.source, 'BBC World');
  assert.equal(worldGroups(snapshot)[0]!.publishedAt, '2026-09-10T10:00:00.000Z');
  const selected = worldGroups(snapshot, ['cna', 'dw']);
  assert.equal(selected[0]!.source, 'DW');
  assert.equal(selected[1]!.source, 'CNA');
  assert.equal(selected[1]!.articles.length, 1);
  assert.equal(selected[1]!.publishedAt, '2026-09-10T08:00:00.000Z');
  assert.equal(worldGroups(snapshot, ['nyt'])[0]!.mayRequireSubscription, true);
  assert.equal(worldStories(snapshot, ['cna'])[0]!.source, 'CNA');
  assert.deepEqual(worldGroups(snapshot, []), []);
});

test('legacy snapshots missing only CNA normalize without mutation or invented successes', () => {
  const legacy = makeSnapshot(); delete legacy.sources.cna;
  const normalized = validateSnapshot(legacy);
  assert.equal(normalized.sources.cna!.status, 'failure');
  assert.equal(normalized.sources.cna!.lastSuccessAt, null);
  assert.deepEqual(normalized.sources.cna!.stories, []);
  assert.equal(legacy.sources.cna, undefined);
  assert.equal(applyContentPermissions(legacy).sources.cna!.status, 'failure');
  type InvalidFixture = { sources: Record<string, unknown> };
  for (const mutate of [(s: InvalidFixture) => delete s.sources.bbc, (s: InvalidFixture) => s.sources.cna = null, (s: InvalidFixture) => s.sources.other = {}]) {
    const invalid = structuredClone(legacy); mutate(invalid);
    assert.throws(() => validateSnapshot(invalid));
  }
});

test('CNA failure recovers both legacy and current snapshots; production collection skips image enrichment', async () => {
  const previous = makeSnapshot(); delete previous.sources.cna;
  const requested: string[] = [];
  const run = (previousSnapshot: unknown, failed: boolean) => collect({ previousSnapshot, now: () => time, log: () => {},
    request: async url => {
      requested.push(url);
      const source = SOURCES.find(source => source.url === url);
      assert.ok(source, 'Only configured feeds may be fetched');
      if (source.id === 'cna' && failed) throw new Error('CNA unavailable');
      if (source.id === 'stringer') return '<section><div class="text-box"><h1>COURAGEOUS STORIES</h1></div><div class="text-box"><p>Synthetic Reporter</p><p><a href="https://example.org/report">Original report</a> Synthetic reporting</p></div></section>';
      return cna;
    },
  });
  // Avoid Stringer article metadata requests by retaining a current successful baseline.
  add(previous, 'stringer', [{ ...story('https://example.org/report'), summary: 'Synthetic reporting', credits: 'Synthetic Reporter' }]);
  const unavailable = await run(previous, true);
  assert.equal(unavailable.sources.cna!.status, 'failure');
  assert.equal(unavailable.sources.cna!.lastSuccessAt, null);
  const fresh = await run(unavailable, false);
  assert.equal(fresh.sources.cna!.status, 'success');
  for (const source of SOURCES.filter(source => source.id !== 'stringer')) {
    assert.ok(fresh.sources[source.id]!.stories.every(story => story.image === null && story.summary === ''));
    assert.ok(requested.includes(source.url));
  }
  const retained = await run(fresh, true);
  assert.equal(retained.sources.cna!.status, 'failure');
  assert.equal(retained.sources.cna!.lastSuccessAt, time);
  assert.deepEqual(retained.sources.cna!.stories, fresh.sources.cna!.stories);
});
