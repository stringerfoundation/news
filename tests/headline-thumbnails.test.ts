import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { publishHeadlineThumbnails } from '../scripts/headline-thumbnails.ts';
import type { CommonsImage } from '../relay/illustration.ts';

const image = (id: number): CommonsImage => ({ version: 1, url: `https://upload.wikimedia.org/wikipedia/commons/${id}.jpg`,
  filePage: `https://commons.wikimedia.org/wiki/File:${id}.jpg`, title: `Image ${id}`, alt: `Alt ${id}`, creator: 'Artist',
  attribution: 'Artist', license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' });
const snapshot = (titles: string[]) => ({ generatedAt: '2026-11-26T00:00:00Z', schemaVersion: 1, sources: Object.fromEntries(['bbc', 'nyt', 'aljazeera', 'dw', 'cna', 'stringer'].map(id => [id, {
  stories: id === 'bbc' ? titles.map((title, index) => ({ title, url: `https://example.org/${index}`, publishedAt: new Date(Date.UTC(2026, 0, titles.length - index)).toISOString(), noteId: `${index}` })) : [],
}])) });
async function makeSite(root: string, titles: string[], editionTitles: string[] = []) {
  const site = join(root, 'site'); await mkdir(join(site, 'data'), { recursive: true });
  await writeFile(join(site, 'index.html'), '<html></html>');
  await writeFile(join(site, 'data', 'news.json'), JSON.stringify(snapshot(titles)));
  if (editionTitles.length) {
    const french = snapshot(editionTitles) as any;
    french.sources = { 'fr-le-monde': { stories: french.sources.bbc.stories } };
    await mkdir(join(site, 'fr'), { recursive: true }); await writeFile(join(site, 'fr', 'headlines.json'), JSON.stringify(french));
  }
  return site;
}

test('writes explicit nulls for Commons search misses among the first five', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const titles = ['Newest A', 'Newest B', 'Newest C', 'Newest D', 'Newest E', 'Sixth'];
  const site = await makeSite(root, titles);
  try {
    const queries: string[] = [];
    const newsPath = join(site, 'data', 'news.json'); const news = JSON.parse(await readFile(newsPath, 'utf8'));
    delete news.sources.bbc.stories[0].noteId; await writeFile(newsPath, JSON.stringify(news));
    await publishHeadlineThumbnails(site, join(root, '.thumbnail-cache'), {
      search: async (query: string) => { queries.push(query); return []; },
      download: async () => { throw new Error('a search miss cannot download'); },
    });
    const result = JSON.parse(await readFile(join(site, 'data', 'news.json'), 'utf8'));
    assert.equal(queries.length, 5);
    assert.equal(Object.keys(result.thumbnails).length, 5);
    assert.ok(Object.values(result.thumbnails).every(value => value === null));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('approved wins, failures are null, concurrency is bounded, and unchanged positives reuse cached bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, ['Approved', 'Offline', 'Auto'], ['Une', 'Deux']);
  const cacheDirectory = join(root, '.thumbnail-cache');
  const approved = image(99); let active = 0, maximum = 0, searches = 0, downloads = 0; const queries: string[] = [];
  const deps = {
    concurrency: 2,
    search: async (query: string) => { searches++; queries.push(query); return []; },
    download: async (url: string) => { downloads++; if (url.endsWith('/99.jpg')) { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; } return Buffer.from(`bytes:${url}`); },
  } as any;
  try {
    const newsPath = join(site, 'data', 'news.json'); const news = JSON.parse(await readFile(newsPath, 'utf8'));
    news.illustrations = { '0': approved }; await writeFile(newsPath, JSON.stringify(news));
    await publishHeadlineThumbnails(site, cacheDirectory, deps);
    let result = JSON.parse(await readFile(newsPath, 'utf8'));
    assert.equal(result.thumbnails['https://example.org/0'].suggested, false);
    assert.equal(result.thumbnails['https://example.org/0'].image.title, 'Image 99');
    assert.equal(result.thumbnails['https://example.org/1'], null);
    assert.ok(maximum <= 2);
    assert.ok(!queries.includes('Approved'), 'approved image is selected before search');
    const before = { searches, downloads };
    await publishHeadlineThumbnails(site, cacheDirectory, deps);
    assert.equal(searches - before.searches, 3, 'only the three earlier Commons misses are searched again');
    assert.equal(downloads, before.downloads, 'successful thumbnail bytes are reused');
    result = JSON.parse(await readFile(newsPath, 'utf8'));
    const localized = JSON.parse(await readFile(join(site, 'fr', 'headlines.json'), 'utf8'));
    assert.deepEqual(Object.keys(localized.thumbnails), ['https://example.org/0', 'https://example.org/1']);
    assert.equal(localized.thumbnails['https://example.org/1'], null);
    const published = await readdir(join(site, 'assets', 'headline-thumbnails'));
    assert.ok(published.length > 0 && published.every(name => /^[0-9a-f]{64}\.webp$/.test(name)));
    assert.ok(JSON.parse(await readFile(join(cacheDirectory, 'index.json'), 'utf8')).length > 0);
    assert.equal(result.thumbnails['https://example.org/0'].image.license, 'CC-BY-4.0');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('approved URL keys normalize and stale bytes refresh', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, ['Retry']); const cacheDirectory = join(root, '.thumbnail-cache');
  const newsPath = join(site, 'data', 'news.json'); const news = JSON.parse(await readFile(newsPath, 'utf8'));
  news.sources.bbc.stories[0].url = 'https://example.org/0#tracking';
  news.illustrations = { '0': image(10) };
  await writeFile(newsPath, JSON.stringify(news));
  const logs: string[] = [];
  const dependencies = {
    download: async (url: string) => { assert.match(url, /\/10\.jpg$/); return Buffer.from('approved image'); },
    log: (line: string) => logs.push(line),
  } as any;
  try {
    await publishHeadlineThumbnails(site, cacheDirectory, dependencies);
    let result = JSON.parse(await readFile(newsPath, 'utf8'));
    assert.ok(result.thumbnails['https://example.org/0#tracking']);
    assert.deepEqual(logs, ['Headline thumbnails en-US: 1/1']);
    const cached = JSON.parse(await readFile(join(cacheDirectory, 'index.json'), 'utf8'));
    cached.push({ key: 'f'.repeat(64), image: image(90), hash: 'a'.repeat(64) });
    await writeFile(join(cacheDirectory, 'index.json'), JSON.stringify(cached));
    await mkdir(join(site, 'assets', 'headline-thumbnails'), { recursive: true });
    await mkdir(join(cacheDirectory, 'assets'), { recursive: true });
    await writeFile(join(site, 'assets', 'headline-thumbnails', 'orphan.webp'), 'orphan');
    await writeFile(join(cacheDirectory, 'assets', 'orphan.webp'), 'orphan');
    await writeFile(join(cacheDirectory, 'assets', `${'a'.repeat(64)}.webp`), 'orphan');
    await writeFile(join(cacheDirectory, 'assets', `${cached[0].hash}.webp`), 'corrupt');
    await publishHeadlineThumbnails(site, cacheDirectory, dependencies);
    result = JSON.parse(await readFile(newsPath, 'utf8'));
    assert.ok(result.thumbnails['https://example.org/0#tracking']);
    const current = JSON.parse(await readFile(join(cacheDirectory, 'index.json'), 'utf8'));
    const hash = current[0].hash;
    await rm(join(cacheDirectory, 'assets', `${hash}.webp`));
    await publishHeadlineThumbnails(site, cacheDirectory, dependencies);
    assert.ok(JSON.parse(await readFile(newsPath, 'utf8')).thumbnails['https://example.org/0#tracking']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('malformed approval falls back to Commons search and remains null on a miss', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, ['Invalid']); const newsPath = join(site, 'data', 'news.json');
  const news = JSON.parse(await readFile(newsPath, 'utf8'));
  news.illustrations = { '0': { version: 1, url: 'http://bad.invalid/image', title: '' } };
  await writeFile(newsPath, JSON.stringify(news));
  try {
    let queries = 0;
    await publishHeadlineThumbnails(site, join(root, '.thumbnail-cache'), {
      search: async () => { queries++; return []; }, download: async () => { throw new Error('search miss cannot download'); }, log: () => {},
    });
    const result = JSON.parse(await readFile(newsPath, 'utf8'));
    assert.equal(queries, 1);
    assert.equal(result.thumbnails['https://example.org/0'], null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('expired publication budget leaves approved thumbnails null', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, ['Budget']);
  try {
    const newsPath = join(site, 'data', 'news.json'); const news = JSON.parse(await readFile(newsPath, 'utf8'));
    news.illustrations = { '0': image(20) }; await writeFile(newsPath, JSON.stringify(news));
    await publishHeadlineThumbnails(site, join(root, '.thumbnail-cache'), {
      timeBudgetMs: 0,
    });
    const result = JSON.parse(await readFile(newsPath, 'utf8'));
    assert.equal(result.thumbnails['https://example.org/0'], null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('empty bytes and download rejection leave only approved entries null', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, ['Empty', 'Reject']); const newsPath = join(site, 'data', 'news.json');
  const news = JSON.parse(await readFile(newsPath, 'utf8'));
  news.illustrations = { '0': image(30), '1': image(31) }; await writeFile(newsPath, JSON.stringify(news));
  try {
    await publishHeadlineThumbnails(site, join(root, '.thumbnail-cache'), { download: async url => {
      if (url.endsWith('/30.jpg')) return Buffer.alloc(0);
      throw new Error('approved source unavailable');
    }, log: () => {} });
    const result = JSON.parse(await readFile(newsPath, 'utf8'));
    assert.equal(result.thumbnails['https://example.org/0'], null);
    assert.equal(result.thumbnails['https://example.org/1'], null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Commons candidates retry, carry attribution, and reuse unchanged suggested bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, ['Sudan faces a hard transition']); const cacheDirectory = join(root, '.thumbnail-cache');
  const seen: { query: string; language: string; ua: string }[] = [];
  let downloads = 0, searches = 0;
  try {
    const deps = {
      search: async (query: string, request: typeof fetch, suggest: boolean, language: string) => {
        searches++; assert.equal(suggest, true);
        const response = await request('https://commons.wikimedia.org/w/api.php');
        await request('https://commons.wikimedia.org/w/api.php', { headers: { accept: 'application/json' } });
        seen.push({ query, language, ua: response.headers.get('x-ua') || '' });
        return [
          { ...image(39), source: 'eu' } as unknown as CommonsImage,
          { ...image(38), creator: 'Unknown artist' },
          image(40), image(41),
        ];
      },
      request: async (_url: RequestInfo | URL, init?: RequestInit) => new Response('{}', { headers: { 'x-ua': new Headers(init?.headers).get('user-agent') || '' } }),
      download: async (url: string) => { downloads++; if (url.endsWith('/40.jpg')) throw new Error('first candidate unavailable'); return Buffer.from('second candidate'); },
      log: () => {},
    };
    await publishHeadlineThumbnails(site, cacheDirectory, deps);
    let news = JSON.parse(await readFile(join(site, 'data', 'news.json'), 'utf8'));
    const selected = news.thumbnails['https://example.org/0'];
    assert.equal(selected.suggested, true);
    assert.equal(selected.image.title, 'Image 41');
    assert.equal(selected.image.license, 'CC-BY-4.0');
    assert.match(selected.image.attribution, /Artist/);
    assert.equal(seen[0]?.query, 'Sudan');
    assert.equal(seen[0]?.language, 'en');
    assert.match(seen[0]?.ua ?? '', /StringerJournalismNews/);
    assert.equal(downloads, 2);
    await publishHeadlineThumbnails(site, cacheDirectory, deps);
    news = JSON.parse(await readFile(join(site, 'data', 'news.json'), 'utf8'));
    assert.equal(news.thumbnails['https://example.org/0'].suggested, true);
    assert.equal(searches, 1); assert.equal(downloads, 2);
    const records = JSON.parse(await readFile(join(cacheDirectory, 'index.json'), 'utf8'));
    records[0].image = null;
    await writeFile(join(cacheDirectory, 'index.json'), JSON.stringify(records));
    await publishHeadlineThumbnails(site, cacheDirectory, deps);
    assert.equal(searches, 2); assert.equal(downloads, 4, 'missing cached metadata triggers a fresh search');
    const updated = JSON.parse(await readFile(join(cacheDirectory, 'index.json'), 'utf8'));
    updated[0].image.creator = 'Unknown artist';
    await writeFile(join(cacheDirectory, 'index.json'), JSON.stringify(updated));
    await publishHeadlineThumbnails(site, cacheDirectory, deps);
    assert.equal(searches, 3); assert.equal(downloads, 6, 'invalid cached credits trigger a fresh Commons search');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('localized searches use the full headline with the edition language', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, [], ['Les dirigeants soudanais discutent du cessez-le-feu']);
  const requests: [string, string][] = [];
  try {
    await publishHeadlineThumbnails(site, join(root, '.thumbnail-cache'), {
      search: async (query: string, _request: typeof fetch, _suggest: boolean, language: string) => { requests.push([query, language]); return []; },
      log: () => {},
    });
    assert.deepEqual(requests, [['Les dirigeants soudanais discutent du cessez-le-feu', 'fr']]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('search failure and post-deadline results leave explicit nulls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'headline-thumbs-'));
  const site = await makeSite(root, ['Unavailable']); const lateSite = await makeSite(join(root, 'late'), ['Too late']);
  try {
    await publishHeadlineThumbnails(site, join(root, '.failed-cache'), {
      search: async () => { throw new Error('Commons search unavailable'); }, log: () => {},
    });
    assert.equal(JSON.parse(await readFile(join(site, 'data', 'news.json'), 'utf8')).thumbnails['https://example.org/0'], null);
    await publishHeadlineThumbnails(lateSite, join(root, '.late-cache'), {
      timeBudgetMs: 1,
      search: async () => { await new Promise(resolve => setTimeout(resolve, 5)); return [image(50)]; },
      download: async () => { throw new Error('download must not begin after deadline'); }, log: () => {},
    });
    assert.equal(JSON.parse(await readFile(join(lateSite, 'data', 'news.json'), 'utf8')).thumbnails['https://example.org/0'], null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
