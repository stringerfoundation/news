import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../../scripts/browser.ts';
import { isPublicAsset } from '../../public-assets.ts';
import { SOURCES } from '../../news-model.ts';
import relayConfig from '../../relay-config.ts';
const reader = `
export const cachedRelaySnapshot = () => null;
export const npubEncode = key => key;
export const commonsSubject = title => title;
export async function readIdentity() { if (window.identityTask) return window.identityTask(); return null; }
export async function readRelaySnapshot(config, report, partial) { window.partial = partial; return new Promise(resolve => { window.finish = resolve; }); }
export async function searchImages(query, source, suggest, request, progress) {
  if (window.searchTask) return window.searchTask(query, progress);
  return {images: [], issues: []};
}
export class ImageSession {
  trustLive = true;
  candidates = new Map();
  constructor(config, refs, changed, ids) { this.refs = Object.fromEntries(ids.map(id => [id, []])); this.changed = changed; window.session = this; window.sessionCount = (window.sessionCount || 0) + 1; }
  canVote() { return window.eligible !== false; }
  selection() { return window.selection || {winner: null, scores: [], latest: new Map()}; }
  async vote(...args) { if (window.voteTask) return window.voteTask(...args); }
  async propose(...args) { if (window.proposeTask) return window.proposeTask(...args); return 'candidate'; }
  close() {}
}`;
const key = relayConfig.pubkey;
const storyId = '1'.repeat(64);
const image = { version: 1, url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg', filePage: 'https://commons.wikimedia.org/wiki/File:Example.jpg', title: 'Example', alt: 'Fixture', creator: 'Photographer', attribution: 'Credit', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };
test('image commands reject stale actions, recover from signer/search failures, and preserve local undo', {timeout: 20000}, async t => {
  const browser = await launchBrowser();
  t.after(() => browser.close());
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // Account changes are driven explicitly below, independently of the polling timer.
    await page.addInitScript('window.__name = fn => fn; window.setInterval = () => 0;');
    let allowReader!: () => void;
    const readerGate = new Promise<void>(resolve => { allowReader = resolve; });
    await page.route('https://reader.test/**', async route => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (file === 'relay-reader.js') { await readerGate; await route.fulfill({contentType: 'text/javascript', body: reader}); return; }
      if (file !== 'index.html' && !isPublicAsset(file)) { await route.abort(); return; }
      await route.fulfill({contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: await readFile(file.endsWith('.js') ? `_site/${file}` : file)});
    });
    await page.route('https://upload.wikimedia.org/**', route => route.abort());
    await page.goto('https://reader.test/', { waitUntil: 'domcontentloaded' });
    const initial = await page.evaluate(async ({storyId, image}) => {
      const path = '/app.js';
      const commands = await import(path) as typeof import('../../app.js');
      commands.renderWorld(); commands.syncImages(); commands.loadSuggestions();
      window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})); commands.skipImage(storyId, image as Parameters<typeof commands.skipImage>[1]);
      await commands.undoImage(storyId); await commands.publishCommons(storyId, image as Parameters<typeof commands.publishCommons>[1]);
      await commands.findCommons(storyId, 'Before modules arrive'); await commands.connectNostr();
      return {options: commands.imageOptions(storyId), voted: await commands.castImageVote(storyId, null), review: commands.imageReview(storyId, 'Example')};
    }, { storyId, image });
    assert.deepEqual(initial, {options: [], voted: false, review: null});
    allowReader();
    await page.waitForFunction(() => typeof (window as unknown as {finish?: unknown}).finish === 'function');
    const snapshot = {schemaVersion: 2, generatedAt: new Date().toISOString(), sources: Object.fromEntries(SOURCES.map(source => [source.id, {stories: source.id === 'bbc' ? [{ title: 'Example', url: 'https://example.org/story', publishedAt: null, image: null, summary: '', noteId: storyId }] : [], attemptedAt: null, lastSuccessAt: null, status: source.id === 'bbc' ? 'success' : 'paused', error: null}]))};
    // Fixture controls model failures at the transport boundary. The actual app
    // module and every UI command run unchanged, with no production source edits.
    await page.evaluate(async ({snapshot, key}) => {
      const win = window as unknown as Record<string, any>;
      win.partial(snapshot);
      const complete = structuredClone(snapshot); complete.sources.bbc!.stories.push({...complete.sources.bbc!.stories[0]!, noteId: '3'.repeat(64), url: 'https://example.org/second'});
      Object.assign(complete.sources.bbc!, {unavailable: 1, status: 'failure'});
      win.partial(complete);
      win.finish(complete);
      win.nostr = {getPublicKey: async () => key, signEvent: async () => { throw new Error('No signing in UI command fixture'); }};
      const path = '/app.js'; const commands = await import(path) as typeof import('../../app.js');
      await commands.connectNostr();
    }, {snapshot, key});
    await page.locator('#world-news article').first().waitFor();
    const outcomes = await page.evaluate(async ({storyId, image, key}) => {
      const win = window as unknown as Record<string, any>;
      const path = '/app.js'; const c = await import(path) as typeof import('../../app.js');
      const photo = image as Parameters<typeof c.publishCommons>[1];
      const outcomes: boolean[] = [win.sessionCount === 2];
      window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}));
      win.session.candidates.set('candidate', photo);
      await c.castImageVote('4'.repeat(64), 'candidate');
      await c.publishCommons('5'.repeat(64), photo);
      win.searchTask = async () => { throw 'offline'; };
      await c.findCommons(storyId, 'Unavailable');
      outcomes.push(document.body.textContent!.includes('Image search is unavailable. Please retry.'));
      win.searchTask = async () => { throw new Error('Search failed'); };
      await c.findCommons(storyId, 'Unavailable');
      outcomes.push(document.body.textContent!.includes('Search failed'));
      win.searchTask = async (_query: string, progress: (value: unknown) => void) => { progress({images: [], issues: ['Optional provider unavailable']}); return {images: [], issues: ['All providers unavailable']}; };
      await c.findCommons(storyId, 'Unavailable');
      outcomes.push(document.body.textContent!.includes('All providers unavailable'));
      win.searchTask = async () => ({images: [photo], issues: []});
      await c.findCommons('2'.repeat(64), 'New search');
      await c.findCommons(storyId, 'Example');
      c.skipImage(storyId, photo);
      outcomes.push(document.body.textContent!.includes('No more suggestions.'));
      await c.undoImage(storyId);
      win.voteTask = async () => { throw 'offline'; };
      outcomes.push(!await c.castImageVote(storyId, null));
      outcomes.push(document.body.textContent!.includes('Could not publish your vote. Please retry.'));
      win.proposeTask = async () => { throw new Error('Candidate rejected'); };
      await c.publishCommons(storyId, photo);
      outcomes.push(document.body.textContent!.includes('Candidate rejected'));
      win.proposeTask = async () => { throw 'offline'; };
      await c.publishCommons(storyId, photo);
      outcomes.push(document.body.textContent!.includes('Could not publish the image. Please retry.'));
      let release!: () => void;
      win.proposeTask = () => new Promise<void>(resolve => {release = resolve;});
      const pending = c.publishCommons(storyId, photo);
      await c.publishCommons(storyId, photo); c.skipImage(storyId, photo); await c.undoImage(storyId);
      outcomes.push(!await c.castImageVote(storyId, null));
      release(); win.voteTask = async () => {};
      await pending;
      outcomes.push(document.body.textContent!.includes('Image and approval published.'));
      win.voteTask = async () => { throw new Error('Undo failed'); };
      await c.undoImage(storyId);
      outcomes.push(document.body.textContent!.includes('Undo failed'));
      win.voteTask = async () => {};
      await c.undoImage(storyId);
      win.eligible = false; win.session.trustLive = false; await c.connectNostr();
      outcomes.push(document.body.textContent!.includes('Waiting for Stringer’s follow list.'));
      win.session.trustLive = true; win.session.changed(); c.loadSuggestions(); c.skipImage(storyId, photo);
      outcomes.push(c.imageReview(storyId, 'Example') === null);
      win.eligible = true;
      win.identityTask = async () => { throw new Error('Profile unavailable'); };
      await c.connectNostr();
      outcomes.push(document.body.textContent!.includes('NIP-05 unavailable'));
      win.nostr = {getPublicKey: async () => 'invalid', signEvent: async () => {}};
      await c.connectNostr();
      win.nostr = undefined; c.detectNostr();
      outcomes.push(!document.querySelector('.account-npub'));
      win.nostr = {getPublicKey: async () => {throw 'Denied';}, signEvent: async () => {}};
      await c.connectNostr(); outcomes.push(document.body.textContent!.includes('Could not connect to your signer.'));
      let resolveKey!: (key: string) => void;
      win.nostr = {getPublicKey: () => new Promise<string>(resolve => {resolveKey = resolve;}), signEvent: async () => {}};
      const keyPending = c.connectNostr(); await c.connectNostr();
      win.nostr = {getPublicKey: async () => key, signEvent: async () => {}};
      resolveKey(key); await keyPending;
      let resolveIdentity!: () => void;
      let identityStarted!: () => void;
      const identityReady = new Promise<void>(resolve => {identityStarted = resolve;});
      win.identityTask = () => new Promise<void>(resolve => {resolveIdentity = resolve; identityStarted();});
      const identityPending = c.connectNostr(); await identityReady;
      (document.querySelector('.image-toolbar button') as HTMLButtonElement).click();
      resolveIdentity(); await identityPending;
      let rejectIdentity!: (reason: Error) => void;
      let rejectionStarted!: () => void;
      const rejectionReady = new Promise<void>(resolve => {rejectionStarted = resolve;});
      win.identityTask = () => new Promise<void>((_resolve, reject) => {rejectIdentity = reject; rejectionStarted();});
      const identityError = c.connectNostr(); await rejectionReady;
      (document.querySelector('.image-toolbar button') as HTMLButtonElement).click();
      rejectIdentity(new Error('Old identity request')); await identityError;
      win.identityTask = async () => null;
      await c.connectNostr();
      win.session.candidates.set('candidate', {...photo, id: 'candidate'});
      win.selection = {winner: {...photo, id: 'candidate'}, scores: [{candidate: {...photo, id: 'candidate'}, count: 1}], latest: new Map([[key, {vote: {candidateId: 'candidate'}, event: {created_at: Math.floor(Date.now() / 1000) - 10}}]])};
      let withdrawn = false; win.voteTask = async (_signer: unknown, _key: string, _story: string, candidate: unknown) => {withdrawn = candidate === null;};
      c.renderWorld();
      (document.querySelector('[data-image-action="' + storyId + ':up"]') as HTMLButtonElement).click();
      await new Promise(resolve => setTimeout(resolve, 0)); outcomes.push(withdrawn);
      const img = document.querySelector('#world-news .wire-thumbnail > a > img') as HTMLImageElement;
      img.closest('a')!.replaceWith(img); img.dispatchEvent(new Event('error'));
      outcomes.push(document.body.textContent!.includes('Image unavailable'));
      let finishProposal!: () => void;
      win.proposeTask = () => new Promise<string>(resolve => {finishProposal = () => resolve('candidate');});
      win.voteTask = async () => {};
      const oldAccountAction = c.publishCommons(storyId, photo);
      win.nostr = {getPublicKey: async () => 'c'.repeat(64), signEvent: async () => {}};
      await c.connectNostr(); finishProposal(); await oldAccountAction;
      outcomes.push((document.querySelector('[data-image-action="' + storyId + ':undo"]') as HTMLButtonElement).disabled);
      win.nostr = {getPublicKey: async () => key, signEvent: async () => {}};
      await c.connectNostr();
      outcomes.push(!(document.querySelector('[data-image-action="' + storyId + ':undo"]') as HTMLButtonElement).disabled);
      return outcomes;
    }, {storyId, image, key});
    assert.ok(outcomes.every(Boolean), JSON.stringify(outcomes));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
