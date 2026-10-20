import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../../scripts/browser.ts';

test('reusable image searches fail closed for malformed responses and recover from optional representative lookups', async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.addInitScript('window.__name = (fn) => fn;');
    await page.route('https://reader.test/**', async route => route.fulfill(new URL(route.request().url()).pathname === '/relay-reader.js'
      ? { contentType: 'text/javascript', body: await readFile('_site/relay-reader.js') }
      : { contentType: 'text/html', body: '<!doctype html><title>Image failure tests</title>' }));
    let catalogRequests = 0;
    await page.route('https://api.openverse.org/**', async route => { catalogRequests++; await route.fulfill({json: {results: []}, headers: {'access-control-allow-origin': '*'}}); });
    await page.goto('https://reader.test/');
    const result = await page.evaluate(async () => {
      const path = '/relay-reader.js';
      const { searchCommons, searchOpenverse, searchEuPhotos, searchImages } = await import(path) as typeof import('../../relay-reader.js');
      let rejected = 0;
      for (const task of [() => searchCommons(' '), () => searchImages(' '),
        () => searchCommons('Subject', async () => new Response(JSON.stringify({ error: 'Unavailable' }))),
        () => searchOpenverse('Subject', async () => new Response('{}')),
        () => searchOpenverse('Subject', async () => new Response('{}'), 'smithsonian'),
        () => searchOpenverse('Subject', async () => new Response('[{}]'), 'smithsonian'),
        () => searchEuPhotos('Subject', async () => new Response('{}'))]) {
        try { await task(); } catch { rejected++; }
      }
      const entry = { title: 'File:Subject.png', imageinfo: [{ mime: 'image/png',
        url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Subject.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Subject.png',
        extmetadata: { Artist: { value: 'Photographer' }, LicenseUrl: { value: 'https://creativecommons.org/publicdomain/zero/1.0/' },
          ObjectName: { value: 'Subject' }, Attribution: { value: 'Photographer' } } }] };
      const degraded: number[] = [];
      for (const wiki of [null, {}, { query: {} }, { query: { pages: [{}] } }, { query: { pages: [{ title: 'Subject', images: [{}, { title: 'Subject location map.svg' }] }] } }, { query: { pages: [{ pageimage: 'Subject.png' }] } }]) {
        degraded.push((await searchCommons('Subject', async input => {
          const url = new URL(String(input));
          if (url.hostname === 'en.wikipedia.org') {
            if (wiki === null) throw new Error('Offline');
            return new Response(JSON.stringify(wiki));
          }
          if (url.searchParams.has('titles')) return new Response('', { status: 503 });
          return new Response(JSON.stringify({ query: { pages: [entry] } }));
        }, true)).length);
      }
      const variants = [{}, { imageinfo: [] }, { imageinfo: [{ mime: 'image/gif' }] },
        { ...entry, imageinfo: [{ ...entry.imageinfo[0], extmetadata: { ...entry.imageinfo[0]!.extmetadata, LicenseUrl: { value: '' } } }] },
        { ...entry, imageinfo: [{ ...entry.imageinfo[0], thumburl: '', url: '' }] }];
      variants.push({ ...entry, imageinfo: [{ ...entry.imageinfo[0], mime: 'image/svg+xml' }] }, { ...entry, imageinfo: [{ ...entry.imageinfo[0], mime: '' }] });
      const missingTitle = await searchCommons('Subject', async () => new Response(JSON.stringify({query: {pages: [{...entry, title: '', imageinfo: [{...entry.imageinfo[0], extmetadata: {...entry.imageinfo[0]!.extmetadata, ObjectName: {value: ''}}}]}]}})));
      const many = await searchCommons('Subject', async () => new Response(JSON.stringify({query: {pages: Array.from({length: 6}, (_, i) => ({...entry, title: `File:Subject${i}.png`, imageinfo: [{...entry.imageinfo[0], descriptionurl: `https://commons.wikimedia.org/wiki/File:Subject${i}.png`}]}))}})));
      const malformed = await searchCommons('Subject', async () => new Response(JSON.stringify({ query: { pages: variants } })));
      const empty = await searchCommons('Subject', async () => new Response('{}'));
      const noRepresentative = await searchCommons('Subject', async input => new Response(JSON.stringify(new URL(String(input)).hostname === 'en.wikipedia.org'
        ? { query: { pages: [{ pageimage: 'Subject.png' }] } } : new URL(String(input)).searchParams.has('titles') ? { error: 'Unavailable' } : { query: {} }), { status: 200 }), true);
      const openverseBase = { id: '12345678-1234-1234-1234-123456789abc', title: 'Subject', creator: 'Photographer', attribution: 'Credit',
        url: 'https://images.example.org/photo.jpg', foreign_landing_url: 'https://example.org/photo', source: 'europeana', license: 'cc0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
      const diverse = await searchOpenverse('Subject', async () => new Response(JSON.stringify({ results: [{}, { ...openverseBase, license: '' },
        { ...openverseBase, source: undefined }, { ...openverseBase, id: undefined }, { ...openverseBase, title: null }, ...Array.from({ length: 6 }, (_, i) => ({ ...openverseBase, title: `Subject ${i}` }))] })));
      const publicDomain = await searchOpenverse('Subject', async () => new Response(JSON.stringify({results: [{...openverseBase, license: 'pdm', license_url: 'https://creativecommons.org/publicdomain/mark/1.0/'}]})));
      const eu = {type: 'PHOTO', ref: 'P-123456/00-01', titles_json: {EN: 'EU subject'}, copyright_json: {year: '2026', holders: {EN: ['European Union']}},
        cc_by_json: [{cc_by: '0'}], cooperator_json: {PHOTOGRAPHER: {EN: {coop: ['Photographer']}}}, media_json: {MED: {PATH: '/01/02/03/P-123456_00-01.jpg'}}};
      const europe = await searchEuPhotos('Subject', async () => new Response(JSON.stringify({response: {docs: [{...eu, ref: undefined}, {...eu, copyright_json: {...eu.copyright_json, year: undefined}}, {...eu, titles_json: undefined}, ...Array.from({length: 6}, () => eu)]}})));
      await Promise.all(Array.from({length: 210}, (_, i) => searchImages(`Cache capacity ${i}`, 'openverse')));
      await searchImages('Last cache entry', 'openverse');
      await searchImages('Last cache entry', 'openverse');
      const nonError = await searchImages('Subject', 'openverse', false, async () => { throw 'Offline'; });
      return { rejected, degraded, malformed, missingTitle, many, empty, noRepresentative, diverse, publicDomain, europe, nonError };
    });
    assert.equal(catalogRequests, 211, 'A repeated recent query must use the bounded cache');
    assert.deepEqual(result.missingTitle, []);
    assert.equal(result.many.length, 5);
    assert.equal(result.publicDomain[0]?.license, 'PDM-1.0');
    assert.equal(result.europe.length, 5);
    assert.equal(result.europe[0]?.alt, 'EU subject');
    assert.equal(result.rejected, 7);
    assert.deepEqual(result.degraded, [1, 1, 1, 1, 1, 1]);
    assert.deepEqual(result.malformed, []);
    assert.deepEqual(result.empty, []);
    assert.deepEqual(result.noRepresentative, []);
    assert.equal(result.diverse.length, 5);
    assert.match(result.nonError.issues[0] || '', /unavailable/);
  } finally { await browser.close(); }
});
