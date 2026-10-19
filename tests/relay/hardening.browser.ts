import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import type { Browser, Page } from '@playwright/test';
import { launchBrowser } from '../../scripts/browser.ts';
import { publicBatch } from './fixture.js';
import { SOURCES } from '../../news-model.js';
import type { Snapshot } from '../../relay/types.js';

let browser: Browser;
const key = generateSecretKey(), pubkey = getPublicKey(key);
const relay = 'wss://hardening.test';
const config = { pubkey, relays: [relay] };
function fixture(offset = 0) {
  const time = new Date(Date.now() - 60_000 + offset).toISOString();
  const snapshot: Snapshot = { schemaVersion: 2, generatedAt: time, sources: Object.fromEntries(
    SOURCES.map(source => [source.id, { stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null }]),
  ) };
  snapshot.sources.bbc = { attemptedAt: time, lastSuccessAt: time, status: 'success', error: null,
    stories: [0, 1].map(index => ({ title: `Fixture ${index}`, url: `https://example.org/${index}`, summary: '', publishedAt: time, image: null })) };
  return publicBatch(snapshot, key).batch;
}
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
async function pageWith(batch: ReturnType<typeof fixture>, delayed = false) {
  const page: Page = await browser.newPage();
  const requests: number[] = [];
  await page.route('https://hardening.test/**', async route => route.fulfill({
    contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html',
    body: route.request().url().endsWith('.js') ? await readFile('_site/relay-reader.js') : '<!doctype html><title>Reader fixture</title>',
  }));
  await page.routeWebSocket(`${relay}/`, socket => socket.onMessage(raw => {
    const [type, id, filter] = JSON.parse(String(raw));
    if (type !== 'REQ') return;
    requests.push(filter.kinds[0]);
    const manifest = filter.kinds.includes(30078);
    const events = manifest ? [batch.manifest] : batch.events;
    const respond = () => {
      for (const event of delayed && !manifest ? events.slice(0, 1) : events)
        socket.send(JSON.stringify(['EVENT', id, event]));
      if (!delayed) socket.send(JSON.stringify(['EOSE', id]));
    };
    if (delayed && manifest) setTimeout(respond, 400); else respond();
  }));
  await page.goto('https://hardening.test/');
  return { page, requests };
}

test('a corrupt future-dated cache cannot block fresh signed relay data', async () => {
  const batch = fixture();
  const { page } = await pageWith(batch);
  try {
    const result = await page.evaluate(async ({ config, batch }) => {
      const bad = { ...batch.manifest, content: JSON.stringify({ ...JSON.parse(batch.manifest.content), generatedAt: '2099-01-01T00:00:00Z' }) };
      localStorage.setItem(`stringer-relay:${config.pubkey}`, JSON.stringify({ manifest: bad, stories: batch.events }));
      const entry = '/reader.js';
      const reader: typeof import('../../relay/reader.js') = await import(entry);
      const cached = reader.cachedRelaySnapshot(config);
      const snapshot = await reader.readRelaySnapshot(config);
      return { cached, snapshot };
    }, { config, batch });
    assert.equal(result.cached, null);
    assert.equal(result.snapshot.sources.bbc!.stories.length, 2);
  } finally { await page.close(); }
});

test('an older relay collection cannot stream over a newer verified cache', async () => {
  const batch = fixture(-60_000), newer = fixture();
  const { page, requests } = await pageWith(batch);
  try {
    const result = await page.evaluate(async ({ config, newer }) => {
      localStorage.setItem(`stringer-relay:${config.pubkey}`, JSON.stringify({ manifest: newer.manifest, stories: newer.events }));
      const entry = '/reader.js';
      const reader: typeof import('../../relay/reader.js') = await import(entry);
      let updates = 0;
      try { await reader.readRelaySnapshot(config, undefined, () => { updates++; }); }
      catch (error) { return { updates, message: String(error) }; }
      return { updates, message: '' };
    }, { config, newer });
    assert.match(result.message, /Older collection/);
    assert.equal(result.updates, 0);
    assert.deepEqual(requests, [30078]);
  } finally { await page.close(); }
});

test('one loading deadline includes manifest lookup, partial stories and retries', { timeout: 10_000 }, async () => {
  const { page, requests } = await pageWith(fixture(), true);
  try {
    const result = await page.evaluate(async config => {
      const entry = '/reader.js';
      const reader: typeof import('../../relay/reader.js') = await import(entry);
      const started = performance.now();
      const snapshot = await reader.readRelaySnapshot(config, undefined, undefined, undefined, { timeoutMs: 1500 });
      return { snapshot, elapsed: performance.now() - started };
    }, config);
    assert.ok(result.elapsed >= 1400 && result.elapsed < 3000, `Load took ${result.elapsed}ms`);
    assert.equal(result.snapshot.sources.bbc!.stories.length, 1);
    assert.equal(result.snapshot.sources.bbc!.unavailable, 1);
    // The rounded deadline timer must not create a sub-millisecond retry.
    assert.deepEqual(requests, [30078, 1]);
  } finally { await page.close(); }
});
