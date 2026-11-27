import test from 'node:test';
import assert from 'node:assert/strict';
import { clearArtist, searchCommons } from '../../relay/commons.js';
import { searchEuPhotos, searchOpenverse } from '../../relay/open-images.js';

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

test('Node Commons auto suggestions keep license, restriction and named-credit gates', async () => {
  assert.equal(clearArtist('Ada Lovelace'), true);
  assert.equal(clearArtist('Unknown author'), false);
  assert.equal(clearArtist('unknown photographer'), false);
  assert.equal(clearArtist('N/A'), false);
  const record = (artist: string, restriction = '') => ({ query: { pages: [{ title: 'File:Example.jpg', imageinfo: [{
    mime: 'image/jpeg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/0/00/example.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.jpg', extmetadata: {
      Artist: { value: artist }, ObjectName: { value: 'Example photo' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' },
      ...(restriction ? { Restrictions: { value: restriction } } : {}),
    },
  }] }] } });
  const request = (entry: ReturnType<typeof record>) => async (input: Parameters<typeof fetch>[0]) =>
    new URL(String(input)).hostname === 'en.wikipedia.org' ? Response.json({ query: { pages: [] } }) : Response.json(entry);

  // Manual editor search stays available even when the source has a placeholder artist.
  assert.equal((await searchCommons('Example', request(record('Unknown author'))))[0]?.creator, 'Unknown author');
  assert.deepEqual(await searchCommons('Example', request(record('Unknown author')), true), []);
  assert.deepEqual(await searchCommons('Example', request(record('Unknown photographer', 'insignia')), true), []);
  assert.equal((await searchCommons('Example', request(record('<b>Ada Example</b>')), true))[0]?.creator, 'Ada Example');
});

test('English Wikipedia representatives match the requested name, including EU expansion', async () => {
  const run = async (query: string, pageTitles: string[]) => {
    let representativeFiles = '';
    const representativePages = pageTitles.map(title => ({ title: `File:${title}.jpg`, imageinfo: [{
      mime: 'image/jpeg', thumburl: `https://upload.wikimedia.org/wikipedia/commons/0/00/${encodeURIComponent(title)}.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      extmetadata: { Artist: { value: 'Ada Photographer' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' }, ObjectName: { value: title } },
    }] }));
    const request: typeof fetch = async input => {
      const url = new URL(String(input));
      if (url.hostname === 'en.wikipedia.org') return Response.json({ query: { pages: pageTitles.map(title => ({ title,
        pageimage: `${title}.jpg` })) } });
      if (url.searchParams.has('titles')) {
        representativeFiles = url.searchParams.get('titles') || '';
        const allowed = new Set(representativeFiles.split('|').map(title => title.replace(/^File:/, '').replaceAll('_', ' ')));
        return Response.json({ query: { pages: representativePages.filter(page => allowed.has(page.title!.replace(/^File:/, ''))) } });
      }
      return Response.json({ query: { pages: [] } });
    };
    let representative: string[] = [];
    const matches = await searchCommons(query, request, true, 'en', images => { representative = images.map(image => image.title); });
    return { representativeFiles, representative, matches: matches.map(image => image.title) };
  };

  const steinmeier = await run('Steinmeier', ['Brussels summit', 'Frank-Walter Steinmeier']);
  assert.deepEqual(steinmeier.representativeFiles, 'File:Frank-Walter Steinmeier.jpg');
  assert.deepEqual(steinmeier.representative, ['Frank-Walter Steinmeier']);
  const eu = await run('EU', ['International committee', 'European Union']);
  assert.deepEqual(eu.representativeFiles, 'File:European Union.jpg');
  assert.deepEqual(eu.representative, ['European Union']);
});

test('localized Wikipedia fallback accepts the EU alias and tolerates empty or failed Commons pages', async () => {
  const lookup = async (query: string, commonsResponse: Record<string, unknown>) => searchCommons(query, async input => {
    const url = new URL(String(input));
    if (url.hostname === 'fr.wikipedia.org') {
      if (url.searchParams.has('titles')) return Response.json({ query: { pages: [] } });
      return Response.json({ query: { pages: [{ title: query === 'EU' ? 'EU' : 'EU', pageimage: 'European_union.png' }] } });
    }
    if (url.searchParams.has('titles')) return Response.json(commonsResponse);
    return Response.json({ query: { pages: [] } });
  }, true, 'fr');

  assert.deepEqual(await lookup('EU', { query: { pages: [] } }), []);
  assert.deepEqual(await lookup('European Union', { error: 'Commons unavailable' }), []);
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
  const euMatches = await searchOpenverse('EU', async () => Response.json({ results: [
    { ...openverseRows[0], title: 'EU summit', id: '12345678-1234-1234-1234-123456789ac0' },
    { ...openverseRows[0], title: 'European Union budget', id: '12345678-1234-1234-1234-123456789ac1' },
    { ...openverseRows[0], title: 'European Commission meeting', id: '12345678-1234-1234-1234-123456789ac2' },
    { ...openverseRows[0], title: 'European Parliament debate', id: '12345678-1234-1234-1234-123456789ac3' },
    { ...openverseRows[0], title: 'International conference', id: '12345678-1234-1234-1234-123456789ac4' },
  ] }), false, true);
  assert.deepEqual(euMatches.map(image => image.title), ['EU summit', 'European Union budget', 'European Commission meeting', 'European Parliament debate']);
  assert.deepEqual(await searchOpenverse('🌧️', async () => Response.json({ results: openverseRows }), false, true), []);
  assert.deepEqual(await searchOpenverse('Missing title', async () => Response.json({ results: [{
    ...openverseRows[0], title: '', id: '12345678-1234-1234-1234-123456789ac5',
  }] })), []);
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
