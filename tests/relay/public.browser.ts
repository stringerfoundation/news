import test from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../../scripts/browser.ts';
import { readFile } from 'node:fs/promises';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { publicBatch } from './fixture.js';
import type { Snapshot } from '../../relay/types.js';
test('relay reader verifies complete collections, preserves order, caches offline and reports unavailable notes', async () => {
  const key = generateSecretKey(),
    pubkey = getPublicKey(key),
    time = new Date(Date.now() - 3 * 3600000).toISOString();
  const snapshot: Snapshot = {
    schemaVersion: 2,
    generatedAt: time,
    sources: Object.fromEntries(
      ['bbc', 'nyt', 'aljazeera', 'dw', 'cna', 'stringer'].map((id) => [
        id,
        { stories: [], attemptedAt: time, lastSuccessAt: null, status: 'paused', error: null },
      ]),
    ),
  };
  snapshot.sources.bbc = {
    stories: [
      {
        title: 'Test headline',
        url: 'https://example.org/news',
        summary: '',
        publishedAt: time,
        image: null,
      },
    ],
    attemptedAt: time,
    lastSuccessAt: time,
    status: 'success',
    error: null,
  };
  snapshot.sources.stringer = {
    stories: [
      {
        title: 'First story',
        credits: 'Fictional Reporter',
        url: 'https://example.org/first',
        summary: 'Synthetic fixture.',
        publishedAt: time,
        image: null,
      },
      {
        title: 'Second story',
        credits: 'Fictional Reporter',
        url: 'https://example.org/second',
        summary: 'Synthetic fixture.',
        publishedAt: time,
        image: null,
      },
    ],
    attemptedAt: time,
    lastSuccessAt: time,
    status: 'success',
    error: null,
  };
  const { batch } = publicBatch(snapshot, key);
  const manifest = JSON.parse(batch.manifest.content);
  // Exercise the signed five-source collection format, including offline cache recovery.
  delete manifest.sources.cna;
  manifest.sources.bbc.pending = 7;
  batch.manifest = finalizeEvent({ ...batch.manifest, content: JSON.stringify(manifest) }, key);
  const browser = await launchBrowser();
  try {
    for (const width of [375, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      let offline = false;
      let missingStory = false;
      let holdInitialResponse = true;
      const initialResponses: (() => void)[] = [];
      let streamInitialStories = true;
      let deliverRemainingStories: (() => void) | undefined;
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'reader.test') {
          await route.abort();
          return;
        }
        const file = url.pathname.replace(/^\/news2\//, '') || 'index.html';
        if (file === 'relay-config.js') {
          await route.fulfill({
            contentType: 'text/javascript',
            body: `export default ${JSON.stringify({ enabled: true, pubkey, relays: ['wss://relay.test', 'wss://silent.test'] })}`,
          });
          return;
        }
        if (
          !['index.html', 'app.js', 'news-model.js', 'response.js', 'publications.js', 'stringer-media.js', 'style.css', 'relay-reader.js'].includes(
            file,
          ) &&
          !/^assets\/[a-z0-9-]+\.png$/.test(file) &&
          !/^assets\/stringer-thumbnails\/[a-zA-Z0-9-]+\.png$/.test(file)
        ) {
          await route.fulfill({ status: 404 });
          return;
        }
        await route.fulfill({
          contentType: file.endsWith('.js')
            ? 'text/javascript'
            : file.endsWith('.css')
              ? 'text/css'
              : file.endsWith('.png')
                ? 'image/png'
                : 'text/html',
          body: await readFile(file.endsWith('.js') ? `_site/${file}` : file),
        });
      });
      // A connected relay that never sends EOSE must not delay a complete response.
      await page.routeWebSocket('wss://silent.test/', () => {});
      await page.routeWebSocket('wss://relay.test/', (socket) => {
        socket.onMessage((raw) => {
          const [type, id, filter] = JSON.parse(String(raw));
          if (type !== 'REQ') return;
          const respond = () => {
          if (offline) {
            socket.close();
            return;
          }
          const events = filter.kinds?.includes(30078)
            ? [batch.manifest]
            : batch.events.filter(
                (e) =>
                  filter.ids?.includes(e.id) &&
                  (!missingStory || !e.content.startsWith('Second story')),
              );
          const send = (notes: typeof events) => {
            for (const event of notes) socket.send(JSON.stringify(['EVENT', id, event]));
            socket.send(JSON.stringify(['EOSE', id]));
          };
          if (streamInitialStories && filter.kinds?.includes(1)) {
            streamInitialStories = false;
            const first = events.find(event => event.tags.some(tag => tag[0] === 'stringer' && tag[1] === 'bbc'))!;
            socket.send(JSON.stringify(['EVENT', id, first]));
            deliverRemainingStories = () => send(events.filter(event => event.id !== first.id));
          } else send(events);
          };
          if (holdInitialResponse) initialResponses.push(respond);
          else respond();
        });
      });
      const started = Date.now();
      await page.goto('https://reader.test/news2/');
      await page.waitForFunction(() => document.querySelector('#relay-status summary')?.textContent?.includes('loading ·'));
      assert.equal(await page.locator('#relay-status').isVisible(), true);
      assert.match(await page.locator('#relay-status-details').textContent() || '', /Total elapsed: \d+\.\d s/);
      holdInitialResponse = false;
      for (const respond of initialResponses) respond();
      await page.locator('#world-news article').waitFor();
      assert.equal(await page.locator('#stringer-news article').count(), 0, 'Headlines render before the remaining stories arrive');
      assert.equal(await page.locator('#world-news').getAttribute('aria-busy'), 'true');
      assert.match(await page.locator('#relay-status summary').textContent() || '', /loading ·/);
      const progressDetails = await page.locator('#relay-status-details').textContent() || '';
      assert.match(progressDetails, /BBC World · loaded in \d+\.\d s/);
      assert.match(progressDetails, /Stringer · loading · \d+\.\d s elapsed · 0\/2 stories/);
      assert.doesNotMatch(await page.locator('main').textContent() || '', /Loading headlines|Loading courageous stories|Verified collection|Loading published stories/);
      assert.equal(await page.locator('#refresh-status').textContent(), '');
      deliverRemainingStories!();
      await page.waitForFunction(() => document.querySelector('#relay-status summary')?.textContent?.includes('loaded in'));
      assert.match(await page.locator('#relay-status summary').textContent() || '', /loaded in \d+\.\d s/);
      assert.match(await page.locator('#relay-status-details').textContent() || '', /Stringer · loaded in \d+\.\d s/);
      assert.match(await page.locator('#relay-status-details').textContent() || '', /CNA · no published stories/);
      assert.ok(Date.now() - started < 5000, 'Healthy relay renders without waiting for silent relay');
      assert.match((await page.locator('#world-status').textContent()) || '', /CNA: refresh unavailable/);
      assert.equal(await page.locator('#nostr-credit').count(), 0);
      const profile = page.getByRole('link', { name: 'Stringer on Nostr via Primal', exact: true });
      if (width <= 920) await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      assert.equal(await profile.getAttribute('href'), 'https://primal.net/p/npub1hq39m0kldtnef85gpeuhn6t4mrn0yw8n95cch399vtktrx8u6urs7rwh7x');
      assert.equal((await profile.locator('svg').boundingBox())?.width, 20);
      if (width <= 920) await page.keyboard.press('Escape');
      assert.deepEqual(new Set(await page.locator('#stringer-news h3').allTextContents()), new Set([
        'First story',
        'Second story',
      ]));
      for (const status of ['#world-status', '#stringer-status'])
        assert.doesNotMatch((await page.locator(status).textContent()) || '', /over two hours old/);
      assert.match(
        (await page.locator('#relay-status-details').textContent()) || '',
        /BBC World · 7 queued/,
      );
      assert.equal(await page.locator('#relay-status').getAttribute('open'), null);
      assert.equal(await page.locator('footer #relay-status').count(), 1);
      assert.equal(await page.locator('.image-disclaimer').count(), 0);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      missingStory = true;
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#relay-status-details')?.textContent?.includes('1 unavailable'));
      await page.waitForFunction(() => document.querySelector('#relay-status summary')?.textContent?.includes('loaded in'));
      assert.match(await page.locator('#relay-status-details').textContent() || '', /Stringer · 1\/2 stories received after \d+\.\d s/);
      await page.locator('#relay-status summary').click();
      await page.getByText(/Stringer.*1 unavailable/).waitFor();
      assert.deepEqual(await page.locator('#stringer-news h3').allTextContents(), ['First story']);
      offline = true;
      await page.reload();
      await page.locator('#world-news article').waitFor();
      await page
        .getByText('Could not check for updates. Keeping the previously loaded collection.')
        .waitFor();
      assert.match(await page.locator('#relay-status summary').textContent() || '', /failed in \d+\.\d s/);
      assert.equal(await page.locator('main #refresh-status').count(), 1);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
