import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event, type EventTemplate } from 'nostr-tools';
import type { WebSocketRoute, Page } from '@playwright/test';
import { launchBrowser } from '../../scripts/browser.mjs';
import { publicBatch } from './fixture.js';
import { IMAGE_MARKER, type Signer } from '../../relay/images.js';
import type { Snapshot } from '../../relay/types.js';
declare global { interface Window { nostr?: Signer; fixtureSign: (event: EventTemplate) => Promise<Event> } }

test('trusted NIP-07 approval propagates to other readers, withdraws, and follows live trust changes', async () => {
  const owner = generateSecretKey(), voter = generateSecretKey(), pubkey = getPublicKey(owner), voterKey = getPublicKey(voter);
  const time = new Date(Date.now() - 3600000).toISOString(), created_at = Math.floor(Date.now() / 1000) - 100;
  const snapshot: Snapshot = { schemaVersion: 2, generatedAt: time, sources: Object.fromEntries(
    ['bbc', 'nyt', 'aljazeera', 'dw', 'cna', 'stringer'].map(id => [id, { stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null }])) };
  snapshot.sources.bbc = { stories: [{ title: 'Synthetic headline', url: 'https://example.org/story', summary: '', publishedAt: time, image: null }], attemptedAt: time, lastSuccessAt: time, status: 'success', error: null };
  const { batch } = publicBatch(snapshot, owner), storyId = batch.events[0]!.id;
  const image = { version: 1, url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.png', filePage: 'https://commons.wikimedia.org/wiki/File:Example.png', title: 'Example Commons file', alt: 'Synthetic illustration', creator: 'Example creator', attribution: 'Example attribution', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };
  const candidate = finalizeEvent({ kind: 1, created_at, content: 'An illustrative image', tags: [['e', storyId, '', 'root'], [IMAGE_MARKER, JSON.stringify(image)]] }, owner);
  const manifest = JSON.parse(batch.manifest.content); manifest.imageCandidates = { [storyId]: [candidate.id] };
  batch.manifest = finalizeEvent({ ...batch.manifest, content: JSON.stringify(manifest) }, owner);
  const follows = (include: boolean, at: number) => finalizeEvent({ kind: 3, created_at: at, content: '', tags: include ? [['p', voterKey]] : [] }, owner);
  const events = [batch.manifest, ...batch.events, candidate, follows(true, created_at)];
  const subscriptions = new Map<WebSocketRoute, Map<string, Record<string, unknown>[]>>();
  const matches = (event: Event, filter: Record<string, unknown>) => Object.entries(filter).every(([key, values]) => {
    const list = values as (string | number)[];
    if (key === 'kinds') return list.includes(event.kind);
    if (key === 'authors') return list.includes(event.pubkey);
    if (key === 'ids') return list.includes(event.id);
    if (key.startsWith('#')) return event.tags.some(tag => tag[0] === key.slice(1) && list.includes(tag[1]!));
    return true;
  });
  const broadcast = (event: Event) => { events.push(event); for (const [socket, subs] of subscriptions) for (const [id, filters] of subs) if (filters.some(f => matches(event, f))) socket.send(JSON.stringify(['EVENT', id, event])); };
  let rejectPublish = false, rejectSign = false, tamperSign = false, offline = false, brokenImage = false;
  const browser = await launchBrowser();
  const errors: string[] = [];
  async function setup(page: Page, signer: boolean) {
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'upload.wikimedia.org' && brokenImage) { await route.fulfill({ status: 404 }); return; }
      if (url.hostname === 'upload.wikimedia.org') { await route.fulfill({ contentType: 'image/png', body: await readFile('assets/favicon-16.png') }); return; }
      if (url.hostname !== 'reader.test') { await route.abort(); return; }
      const file = url.pathname.slice(1) || 'index.html';
      if (file === 'relay-config.js') { await route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify({ enabled: true, pubkey, relays: ['wss://relay.test'] })}` }); return; }
      if (!/^(index.html|app.js|news-model.js|stringer-media.js|style.css|relay-reader.js|assets\/[\w/-]+\.png)$/.test(file)) { await route.fulfill({ status: 404 }); return; }
      await route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html', body: await readFile(file.endsWith('.js') ? `_site/${file}` : file) });
    });
    await page.routeWebSocket('wss://relay.test/', socket => {
      const subs = new Map<string, Record<string, unknown>[]>(); subscriptions.set(socket, subs);
      socket.onClose(() => subscriptions.delete(socket));
      socket.onMessage(raw => {
        const [type, id, ...filters] = JSON.parse(String(raw));
        if (type === 'CLOSE') { subs.delete(id); return; }
        if (type === 'EVENT') {
          const event = id as Event;
          socket.send(JSON.stringify(['OK', event.id, !rejectPublish, rejectPublish ? 'blocked: fixture rejection' : '']));
          if (!rejectPublish) broadcast(event);
          return;
        }
        if (type !== 'REQ') return;
        if (offline) { socket.close(); return; }
        subs.set(id, filters);
        const found = new Map<string, Event>();
        for (const filter of filters) {
          for (const event of events.filter(e => matches(e, filter)).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)).slice(0, filter.limit ?? 1000)) found.set(event.id, event);
        }
        for (const event of found.values()) socket.send(JSON.stringify(['EVENT', id, event]));
        socket.send(JSON.stringify(['EOSE', id]));
      });
    });
    if (signer) {
      await page.exposeFunction('fixtureSign', (event: EventTemplate) => { if (rejectSign) throw new Error('Signer rejected request'); return finalizeEvent(tamperSign ? { ...event, content: 'Signer changed payload' } : event, voter); });
      await page.addInitScript(key => {
        window.nostr = {
          async getPublicKey() { return key; },
          signEvent(event) { return window.fixtureSign(event); },
        };
      }, voterKey);
    }
    await page.goto('https://reader.test/');
    await page.getByRole('heading', { name: 'Synthetic headline' }).waitFor();
    await page.getByRole('button', { name: 'Connect Nostr', exact: true }).waitFor();
  }
  try {
    const editor = await browser.newPage({ viewport: { width: 375, height: 1000 } });
    const reader = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await setup(editor, true); await setup(reader, false);
    assert.equal(await reader.locator('#world-news img').count(), 0);
    await editor.getByRole('button', { name: 'Connect Nostr', exact: true }).click();
    await editor.getByText('Review illustrative images', { exact: true }).click();
    rejectSign = true;
    await editor.getByRole('button', { name: 'Upvote image (0)', exact: true }).click();
    await editor.getByText('Signer rejected request', { exact: true }).waitFor();
    rejectSign = false;
    await editor.evaluate(key => {
      if (!window.nostr) throw new Error('Missing fixture signer');
      window.nostr.getPublicKey = async () => key;
    }, pubkey);
    await editor.getByRole('button', { name: 'Upvote image (0)', exact: true }).click();
    await editor.getByText('This account is not currently eligible to approve images.', { exact: true }).waitFor();
    await editor.evaluate(key => {
      if (!window.nostr) throw new Error('Missing fixture signer');
      window.nostr.getPublicKey = async () => key;
    }, voterKey);
    tamperSign = true;
    await editor.getByRole('button', { name: 'Upvote image (0)', exact: true }).click();
    await editor.getByText('Signer changed the requested vote.', { exact: true }).waitFor();
    tamperSign = false; rejectPublish = true;
    await editor.getByRole('button', { name: 'Upvote image (0)', exact: true }).click();
    await editor.getByText('Could not publish your vote. Please retry.', { exact: true }).waitFor();
    assert.equal(await reader.locator('#world-news img').count(), 0);
    rejectPublish = false;
    await editor.getByRole('button', { name: 'Upvote image (0)', exact: true }).click();
    await editor.getByText('Vote published.', { exact: true }).waitFor();
    await reader.locator('#world-news .wire-thumbnail img').waitFor();
    assert.match(await reader.locator('#world-news figcaption').textContent() || '', /Illustrative image.*Example creator.*CC0-1.0/);
    assert.equal(await reader.getByText('Review illustrative images', { exact: true }).count(), 0);
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    offline = true;
    await reader.reload();
    await reader.locator('#world-news .wire-thumbnail img').waitFor();
    offline = false;
    await reader.reload();
    await reader.locator('#world-news .wire-thumbnail img').waitFor();
    brokenImage = true;
    await reader.reload();
    await reader.getByRole('heading', { name: 'Synthetic headline' }).waitFor();
    await reader.waitForFunction(() => !document.querySelector('#world-news .wire-thumbnail'));
    brokenImage = false;
    await reader.reload();
    await reader.locator('#world-news .wire-thumbnail img').waitFor();
    const voteTime = Math.max(...events.filter(e => e.pubkey === voterKey).map(e => e.created_at));
    await editor.waitForFunction(at => Math.floor(Date.now() / 1000) > at, voteTime);
    await editor.getByRole('button', { name: 'Withdraw approval', exact: true }).click();
    await editor.getByText('Vote published.', { exact: true }).waitFor();
    await reader.waitForFunction(() => !document.querySelector('#world-news .wire-thumbnail'));
    const withdrawalTime = Math.max(...events.filter(e => e.pubkey === voterKey).map(e => e.created_at));
    await editor.waitForFunction(at => Math.floor(Date.now() / 1000) > at, withdrawalTime);
    await editor.getByRole('button', { name: 'Upvote image (0)', exact: true }).click();
    await reader.locator('#world-news .wire-thumbnail img').waitFor();
    broadcast(follows(false, created_at + 1));
    await reader.waitForFunction(() => !document.querySelector('#world-news .wire-thumbnail'));
    await editor.getByText('This account is not followed by Stringer and cannot approve images.', { exact: true }).waitFor();
    assert.equal(await editor.getByText('Review illustrative images', { exact: true }).count(), 0);
    await reader.getByRole('button', { name: 'Connect Nostr', exact: true }).click();
    await reader.getByText('Install a NIP-07 Nostr signer to approve images.', { exact: true }).waitFor();
    const noImages = finalizeEvent({ ...batch.manifest, content: JSON.stringify({ ...manifest, imageCandidates: {} }), created_at: batch.manifest.created_at + 1 }, owner);
    broadcast(noImages);
    await reader.reload();
    await reader.getByRole('heading', { name: 'Synthetic headline' }).waitFor();
    assert.equal(await reader.locator('#world-news img').count(), 0);
    assert.equal(await reader.locator('.image-toolbar').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
