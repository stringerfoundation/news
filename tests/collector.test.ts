import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, enrichPublications, fetchText, parseFeed, parsePublication } from '../scripts/collect.ts';
import { SOURCES } from '../news-model.ts';
import type { Snapshot, Story } from '../relay/types.js';

const time = '2026-10-19T12:00:00.000Z';
const story: Story = {
  title: 'Synthetic headline', url: 'https://example.org/story', summary: '',
  publishedAt: time, image: null,
};
const rss = (items: string) => `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Synthetic feed</title>${items}</channel></rss>`;
const item = (extra = '') => `<item><title>Synthetic headline</title><link>${story.url}</link><pubDate>${time}</pubDate>${extra}</item>`;

test('RSS parsing preserves safe stories and rejects malformed roots, items and URLs', () => {
  assert.deepEqual(parseFeed(rss(item() + item())), [story]);
  assert.deepEqual(parseFeed(rss('')), []);
  for (const xml of ['<rss>', '<html>Unavailable</html>', '<rss><channel>invalid</channel></rss>',
    rss('<item/>'), rss(item().replace(story.url, 'javascript:alert(1)'))])
    assert.throws(() => parseFeed(xml));
});

test('optional malformed media cannot discard an otherwise valid headline', () => {
  const parsed = parseFeed(rss(item('<media:group>invalid</media:group><media:thumbnail/><enclosure type="text/plain" url="https://example.org/document"/>')));
  assert.equal(parsed[0]!.image, null);
  const image = parseFeed(rss(item('<media:thumbnail url="https://example.org/photo.png"/>')))[0]!.image;
  assert.equal(image?.url, 'https://example.org/photo.png');
});

test('publication parsing preserves calendar dates and explicitly zoned timestamps', () => {
  assert.deepEqual(parsePublication('<meta property="article:published_time" content="2026-10-19">'), {
    publishedAt: null, publicationDate: '2026-10-19',
  });
  assert.deepEqual(parsePublication('<meta property="article:published_time" content="2026-10-19T12:00:00+02:00">'), {
    publishedAt: '2026-10-19T10:00:00.000Z', publicationDate: null,
  });
  assert.deepEqual(parsePublication('<script type="application/ld+json">[null,1,{"@type":{},"datePublished":"2026-10-19"}]</script>'), {
    publishedAt: null, publicationDate: null,
  });
});

test('metadata outages retain an exact previously verified publication instant', async () => {
  const previous: Story = { ...story, publishedAt: '2026-10-18T11:00:00.000Z', publicationSource: story.url };
  const result = await enrichPublications([{ ...story, publishedAt: null }], [previous], async () => { throw new Error('Unavailable'); });
  assert.equal(result[0]!.publishedAt, previous.publishedAt);
  assert.equal(result[0]!.publicationSource, story.url);
  assert.equal(previous.publishedAt, '2026-10-18T11:00:00.000Z');
});

test('non-Error request failures retain prior reporting with honest failure metadata', async () => {
  const previous: Snapshot = {
    schemaVersion: 2, generatedAt: time,
    sources: Object.fromEntries(SOURCES.map(({ id }) => [id, {
      stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null,
    }])),
  };
  previous.sources.bbc = { stories: [story], attemptedAt: time, lastSuccessAt: time, status: 'success', error: null };
  const next = await collect({ previousSnapshot: previous, now: () => '2026-10-19T12:01:00.000Z',
    request: async () => { throw null; }, log: () => {},
  });
  assert.equal(next.sources.bbc!.status, 'failure');
  assert.equal(next.sources.bbc!.lastSuccessAt, time);
  assert.equal(next.sources.bbc!.error, 'null');
  assert.equal(next.sources.bbc!.stories[0]!.url, story.url);
  assert.equal(previous.sources.bbc.status, 'success');
});

test('bounded retries recover without skipping the configured backoff', async () => {
  let calls = 0;
  const delays: number[] = [];
  const body = await fetchText(story.url, {
    fetchImpl: async () => ++calls < 3 ? new Response('', { status: 503 }) : new Response('recovered'),
    sleep: async (milliseconds) => { delays.push(milliseconds); },
  });
  assert.equal(body, 'recovered');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test('article redirects are checked before requesting an unconfigured host', async () => {
  const requested: string[] = [];
  await assert.rejects(fetchText(story.url, { attempts: 1, allowedHosts: ['example.org'],
    fetchImpl: async (url) => {
      requested.push(String(url));
      return new Response(null, { status: 302, headers: { location: 'https://unconfigured.test/photo' } });
    },
  }), /Article host not configured/);
  assert.deepEqual(requested, [story.url]);
});

test('invalid request attempt counts fail before making a request', async () => {
  let calls = 0;
  for (const attempts of [0, -1, 1.5, NaN, Infinity])
    await assert.rejects(fetchText(story.url, { attempts, fetchImpl: async () => { calls++; return new Response(''); } }), /positive integer/);
  assert.equal(calls, 0);
});
