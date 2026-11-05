import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../scripts/browser.ts';
import { checkHomepage, runSmoke } from '../scripts/smoke-homepage.ts';
import { readFile } from 'node:fs/promises';
import { SOURCES } from '../news-model.ts';

const version = '1234567890abcdef';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

// These fixtures exercise the monitor's acceptance contract, not relay behavior.
// Existing signed-relay browser tests exercise real reader/relay interactions.
function fixture(options = {}) {
  const contexts = [];
  return {
    contexts,
    async newContext(settings) {
      const context = await browser.newContext(settings);
      contexts.push(context);
      await context.route('https://smoke.test/**', async route => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1);
        if (name.endsWith('.js') || name.endsWith('.css')) {
          if (options.abort && name === 'app.js') return route.abort();
          return route.fulfill({ status: options.broken && name === 'app.js' ? 503 : 200,
            contentType: name.endsWith('.js') ? 'text/javascript' : 'text/css', body: '' });
        }
        const assets = ['app.js', 'news-model.js', 'relay-config.js', 'relay-reader.js', 'stringer-media.js', 'response.js', 'publications.js'];
        const body = `<!doctype html><html><head><base href="/news-assets/">
          <link rel="stylesheet" href="./style.css?v=${version}">
          ${assets.filter(name => name !== options.missing).map(name =>
            `<script src="./${name}?v=${name === options.stale ? '0000000000000000' : version}"></script>`).join('')}
          </head><body style="margin:0;${options.overflow ? 'min-width:2000px' : ''}">
          <div id="world-news" aria-busy="true"></div><div id="stringer-news" aria-busy="true"></div>
          <details id="relay-status"><summary>${options.failed ? 'failed in 1 s' : 'loaded in 1 s'}</summary>
          <div id="relay-status-details">Stringer · 1/2 stories · 1 unavailable</div></details>
          <script>
          if (localStorage.getItem('monitor')) throw Error('Context was reused');
          localStorage.setItem('monitor', 'visited');
          setTimeout(() => {
            document.querySelector('#world-news').innerHTML = '<article>Fixture headline</article>';
            ${options.empty ? '' : "document.querySelector('#stringer-news').innerHTML = '<article>Fixture story</article>';"}
            ${options.pending ? '' : "document.querySelectorAll('[aria-busy]').forEach(el => el.setAttribute('aria-busy', 'false'));"}
          }, ${options.delay || 0});
          ${options.error ? "throw Error('Fixture script failure');" : ''}
          </script></body></html>`;
        return route.fulfill({ status: options.httpError ? 502 : 200, contentType: 'text/html', body });
      });
      return context;
    },
  };
}

test('monitor checks desktop/mobile from clean contexts, honors the Worker base path and reports partial counts', async () => {
  const target = fixture();
  const results = await checkHomepage(target, 'https://smoke.test/', version);
  assert.deepEqual(results.map(x => x.width), [1280, 375]);
  for (const result of results) {
    assert.equal(result.headlines, 1);
    assert.equal(result.stories, 1);
    assert.equal(result.version, version);
    assert.match(result.feedStatus, /1 unavailable/);
    assert.ok(result.completedMs < 15000);
  }
  assert.equal(browser.contexts().length, 0);
});

test('monitor rejects stale releases, failed assets, script errors, overflow and failed refreshes', async () => {
  for (const [options, message] of [
    [{ stale: 'relay-reader.js' }, /approved asset version/],
    [{ stale: 'stringer-media.js' }, /approved asset version/],
    [{ stale: 'response.js' }, /approved asset version/],
    [{ missing: 'app.js' }, /approved asset version/],
    [{ abort: true }, /Reader errors/],
    [{ broken: true }, /Reader errors/],
    [{ error: true }, /Reader errors/],
    [{ overflow: true }, /Horizontal overflow/],
    [{ failed: true }, /failed refresh/],
    [{ httpError: true }, /successful response/],
  ]) {
    await assert.rejects(checkHomepage(fixture(options), 'https://smoke.test/', version,
      { widths: [375] }), message);
    assert.equal(browser.contexts().length, 0, 'Failure must close the empty context');
  }
});

test('monitor bounds first content and refuses empty or never-finished columns', async () => {
  for (const options of [{ delay: 5000 }, { empty: true }, { pending: true }]) {
    await assert.rejects(checkHomepage(fixture(options), 'https://smoke.test/', version,
      { widths: [375], firstStoryMs: 700, completionMs: 1400 }), /Timeout|exceeded/);
    assert.equal(browser.contexts().length, 0);
  }
});

test('runner reads the approved artifact or explicit monitor version and closes the browser on failure', async () => {
  for (const explicit of [true, false]) {
    let closed = false;
    const env = { READER_PUBLIC_URL: 'https://smoke.test/' };
    if (explicit) env.EXPECTED_READER_VERSION = version;
    let output;
    await runSmoke({ env, read: async () => `<script src="./app.js?v=${version}"></script>`,
      launch: async () => ({ ...fixture(), close: async () => { closed = true; } }),
      write: text => { output = JSON.parse(text); } });
    assert.equal(output.length, 2);
    assert.equal(closed, true);
  }
  let closed = false;
  await assert.rejects(runSmoke({ env: { READER_PUBLIC_URL: 'https://smoke.test/', EXPECTED_READER_VERSION: version },
    launch: async () => ({ ...fixture({ failed: true }), close: async () => { closed = true; } }) }), /failed refresh/);
  assert.equal(closed, true);
});

test('monitor accepts the actual reader UI with a synthetic relay collection', async () => {
  const time = new Date().toISOString();
  const snapshot = { schemaVersion: 2, generatedAt: time,
    sources: Object.fromEntries(SOURCES.map(source => [source.id, {
      attemptedAt: time, lastSuccessAt: time, status: 'success', error: null,
      stories: [{ title: `Synthetic ${source.id}`, url: `https://example.org/${source.id}`,
        summary: '', publishedAt: time, image: null }],
    }])) };
  const target = {
    async newContext(settings) {
      const context = await browser.newContext(settings);
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'smoke.test') return route.abort();
        const name = url.pathname.slice('/news/'.length) || 'index.html';
        let body, contentType = 'text/javascript';
        if (name === 'relay-config.js') body = 'export default {enabled: true};';
        else if (name === 'relay-reader.js') body = `export const cachedRelaySnapshot = () => null;
          export const readRelaySnapshot = async () => (${JSON.stringify(snapshot)});`;
        else if (['index.html', 'app.js', 'news-model.js', 'stringer-media.js', 'response.js', 'publications.js', 'style.css'].includes(name)) {
          body = (await readFile(new URL('../_site/' + name, import.meta.url), 'utf8')).replace(
            /(["'])\.\/([a-zA-Z0-9-]+\.(?:js|css))(?:\?[^"']*)?\1/g,
            (_, quote, asset) => `${quote}./${asset}?v=${version}${quote}`);
          if (name === 'index.html') contentType = 'text/html';
          if (name === 'style.css') contentType = 'text/css';
        } else return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType, body });
      });
      return context;
    },
  };
  const results = await checkHomepage(target, 'https://smoke.test/news/', version);
  for (const result of results) {
    assert.equal(result.headlines, 5);
    assert.equal(result.stories, 1);
  }
});
