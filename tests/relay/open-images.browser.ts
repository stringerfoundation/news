import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../../scripts/browser.mjs';

test('source adapters preserve credits, reject unsuitable metadata and recover from partial outages', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.addInitScript('window.__name = (fn) => fn;');
    await page.route('https://reader.test/**', async route => route.fulfill(new URL(route.request().url()).pathname === '/relay-reader.js'
      ? { contentType: 'text/javascript', body: await readFile('_site/relay-reader.js') }
      : { contentType: 'text/html', body: '<!doctype html><title>Image source adapter tests</title>' }));
    await page.goto('https://reader.test/');
    const result = await page.evaluate(async () => {
      const moduleUrl = '/relay-reader.js';
      const { searchOpenverse, searchEuPhotos, searchImages } = await import(moduleUrl);
      const photo = { id: '12345678-1234-1234-1234-123456789abc', title: '<b>Example subject</b>', creator: '<a>Example photographer</a>',
        attribution: 'Example credit', url: 'https://live.staticflickr.com/1/123456789_example.jpg', foreign_landing_url: 'https://www.flickr.com/photos/example/123456789',
        source: 'flickr', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/' };
      const eu = { type: 'PHOTO', ref: 'P-123456/00-01', titles_json: { EN: '<b>EU subject</b>' }, summary_json: { EN: 'EU illustration' },
        copyright_json: { year: '2026', holders: { EN: ['European Union'] } }, cc_by_json: [{ cc_by: '0', titles: {}, links: {} }],
        cooperator_json: { PHOTOGRAPHER: { EN: { coop: ['EU photographer'] } }, AGENCY: { EN: { coop: ['Example agency'] } } },
        media_json: { LOW: { PATH: '/01/02/03/P-123456_00-01.jpg' } } };
      let sourceFilter = '', licenses = '';
      const openverseRequest: typeof fetch = async input => {
        const url = new URL(String(input)); sourceFilter = url.searchParams.get('source') || ''; licenses = url.searchParams.get('license') || '';
        return new Response(JSON.stringify({ results: [photo, { ...photo, license: 'by-nc' }, { ...photo, creator: '' },
          { ...photo, mature: true }, { ...photo, source: 'wikimedia' }, { ...photo, url: 'https://127.0.0.1/a.jpg' }] }));
      };
      const ov = await searchOpenverse('Example', openverseRequest, true);
      const european = await searchEuPhotos('Example', async () => new Response(JSON.stringify({ response: { docs: [eu,
        { ...eu, copyright_json: { year: '2026', holders: { EN: ['Third party'] } } },
        { ...eu, cc_by_json: [{ cc_by: '0', titles: { EN: 'No redistribution' }, links: {} }] },
        { ...eu, cooperator_json: {} }, { ...eu, media_json: { LOW: { PATH: '/../private.jpg' } } },
      ] } })));
      const fallback = await searchImages('Fallback', 'all', true, async (input: Parameters<typeof fetch>[0]) => {
        if (new URL(String(input)).hostname === 'api.openverse.org') return new Response(JSON.stringify({ results: [photo] }));
        return new Response('', { status: 503 });
      });
      const limited = await searchImages('Rate limited', 'openverse', false, async () => new Response('', { status: 429 }));
      const empty = await searchImages('No results', 'all', false, async (input: Parameters<typeof fetch>[0]) => new Response(JSON.stringify(
        new URL(String(input)).hostname === 'api.openverse.org' ? { results: [] }
          : new URL(String(input)).hostname === 'commons.wikimedia.org' ? { query: { pages: [] } } : { response: { docs: [] } })));
      return { ov, european, sourceFilter, licenses, fallback, limited, empty };
    });
    assert.equal(result.ov.length, 1);
    assert.equal(result.ov[0].title, 'Example subject');
    assert.equal(result.ov[0].creator, 'Example photographer');
    assert.equal(result.ov[0].filePage, 'https://www.flickr.com/photos/example/123456789');
    assert.equal(result.sourceFilter, 'flickr');
    assert.equal(result.licenses, 'by,by-sa,cc0,pdm');
    assert.equal(result.european.length, 1);
    assert.equal(result.european[0].creator, 'EU photographer');
    assert.match(result.european[0].attribution, /European Union, 2026.*Example agency/);
    assert.equal(result.european[0].license, 'CC-BY-4.0');
    assert.equal(result.fallback.images.length, 1);
    assert.equal(result.fallback.issues.length, 2);
    assert.equal(result.limited.images.length, 0);
    assert.match(result.limited.issues[0], /Search limit reached/);
    assert.deepEqual(result.empty, { images: [], issues: [] });
  } finally { await browser.close(); }
});
