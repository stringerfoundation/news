import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { searchCommons } from '../../relay/commons.js';
import { searchEuPhotos, searchOpenverse } from '../../relay/open-images.js';

// Suggestion publishing is approval-only. Adapt the browser parser in Node
// tests with the already-installed Cheerio parser without shipping a server parser.
Object.defineProperty(globalThis, 'DOMParser', { configurable: true, value: class {
  parseFromString(markup: string) {
    const $ = load(markup);
    return { body: { textContent: $('body').text() || $.root().text() } };
  }
} });

test('image metadata parsing works in Node and strips markup into text', async () => {
  const commons = await searchCommons('Example', async () => Response.json({ query: { pages: [{ title: 'File:Example.jpg', imageinfo: [{
    mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/0/00/example.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
    extmetadata: { Artist: { value: '<b>Ada</b> &amp; Bob' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
      ObjectName: { value: '<i>Example title</i>' }, ImageDescription: { value: '<p>An <em>example</em></p>' } },
  }] }] } }));
  assert.equal(commons[0]?.title, 'Example title');
  assert.equal(commons[0]?.creator, 'Ada & Bob');
  assert.equal(commons[0]?.alt, 'An example');

  const openverse = await searchOpenverse('Example', async () => Response.json({ results: [{
    id: '12345678-1234-1234-1234-123456789abc', title: '<b>Openverse title</b>', creator: '<i>Creator</i>',
    attribution: 'Credit', url: 'https://images.example.org/image.jpg', foreign_landing_url: 'https://example.org/image',
    source: 'europeana', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/',
  }] }));
  assert.equal(openverse[0]?.title, 'Openverse title');
  assert.equal(openverse[0]?.creator, 'Creator');
});

test('EU Solr header-only zero results are empty while malformed responses still fail', async () => {
  assert.deepEqual(await searchEuPhotos('At', async () => Response.json({ responseHeader: { status: 0, QTime: 1 } })), []);
  await assert.rejects(searchEuPhotos('At', async () => Response.json({ responseHeader: { status: 0, QTime: 1 }, response: {} })), /Invalid EU photo search response/);
  await assert.rejects(searchEuPhotos('At', async () => Response.json({ responseHeader: { status: 1, QTime: 1 } })), /Invalid EU photo search response/);
});

test('automatic external suggestions require the subject in image metadata', async () => {
  const openverseRows = ['Gaza rain shelter', 'Steinmeier in Brussels'].map((title, index) => ({
    id: `12345678-1234-1234-1234-123456789ab${index}`, title, creator: 'Photographer', attribution: 'Credit',
    url: `https://images.example.org/${index}.jpg`, foreign_landing_url: `https://example.org/${index}`,
    source: 'europeana', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/',
  }));
  const openverse = await searchOpenverse('Gaza', async () => Response.json({ results: openverseRows }), false, true);
  assert.deepEqual(openverse.map(image => image.title), ['Gaza rain shelter']);
  const unicode = await searchOpenverse('İZMİR', async () => Response.json({ results: [{
    ...openverseRows[0], title: 'İzmir shoreline', id: '12345678-1234-1234-1234-123456789abd',
  }] }), false, true);
  assert.equal(unicode[0]?.title, 'İzmir shoreline');

  const eu = (title: string, ref: string) => ({ type: 'PHOTO', ref: `P-${ref}/00-01`, titles_json: { EN: title }, summary_json: { EN: 'Photograph' },
    copyright_json: { year: '2026', holders: { EN: ['European Union'] } }, cc_by_json: [{ cc_by: '0', titles: {}, links: {} }],
    cooperator_json: { PHOTOGRAPHER: { EN: { coop: ['Photographer'] } } }, media_json: { LOW: { PATH: `/01/02/03/P-${ref}_00-01.jpg` } } });
  const european = await searchEuPhotos('Gaza', async () => Response.json({ response: { docs: [eu('Gaza shelter', '123456'), eu('Steinmeier visit to Brussels', '234567')] } }), true);
  assert.deepEqual(european.map(image => image.title), ['Gaza shelter']);
});
