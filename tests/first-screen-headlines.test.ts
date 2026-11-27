import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sourcesForLocale } from '../edition-sources.ts';
import { firstScreenHeadlines } from '../scripts/first-screen-headlines.ts';

const story = (id: string, publishedAt = new Date().toISOString()) => ({ title: id, url: `https://example.org/${id}`, summary: '', publishedAt, image: null });
const source = (id: string, stories: ReturnType<typeof story>[], status: 'success' | 'failure' = 'success', unavailable = 0) => ({
  [id]: { stories, attemptedAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), status, error: null, unavailable },
});
const snapshot = (sources: Record<string, any>) => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), sources }) as any;

test('English selection follows the combined live world headline order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'first-screen-'));
  try {
    await writeFile(join(root, 'index.html'), '<html><script id="atomstr-headlines" type="application/json">{}</script></html>');
    const sources = Object.assign({}, ...['bbc', 'nyt', 'aljazeera', 'dw', 'cna'].map((id, index) => source(id, [story(id, new Date(Date.now() - index * 1000).toISOString())])));
    const result = await firstScreenHeadlines(root, 'en-US', snapshot(sources));
    assert.deepEqual(result.map(item => item.url), ['https://example.org/bbc', 'https://example.org/nyt', 'https://example.org/aljazeera', 'https://example.org/dw', 'https://example.org/cna']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('English selection includes fresh embedded Atomstr fallback stories after live stories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'first-screen-'));
  const now = new Date();
  const embedded = { dw: { lastSuccessAt: now.toISOString(), stories: [story('fallback-dw', now.toISOString())] } };
  try {
    await writeFile(join(root, 'index.html'), `<html><script id="atomstr-headlines" type="application/json">${JSON.stringify(embedded)}</script></html>`);
    const sources = { ...source('bbc', [story('live-bbc')]), ...source('dw', [], 'failure') };
    const result = await firstScreenHeadlines(root, 'en-US', snapshot(sources));
    assert.deepEqual(result.map(item => item.url), ['https://example.org/live-bbc', 'https://example.org/fallback-dw']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('localized selection uses its configured source order and the Swahili publisher registry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'first-screen-'));
  const frenchSource = sourcesForLocale('fr')[0]!;
  try {
    const french = await firstScreenHeadlines(root, 'fr', snapshot(source(frenchSource.id, [story('french')])));
    const swahili = await firstScreenHeadlines(root, 'sw', snapshot(source('sw-rfi', [story('swahili')])));
    const unknown = await firstScreenHeadlines(root, 'xx', snapshot({}));
    assert.deepEqual(french.map(item => item.url), ['https://example.org/french']);
    assert.deepEqual(swahili.map(item => item.url), ['https://example.org/swahili']);
    assert.deepEqual(unknown, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
