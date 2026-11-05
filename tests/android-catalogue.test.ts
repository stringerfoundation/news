import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { androidCatalogue, catalogueJson, generateCatalogue, CATALOGUE_PATH } from '../scripts/generate-android-catalogue.ts';
import { EDITIONS, translator } from '../reader-locales.ts';
import { EDITION_SOURCES } from '../edition-sources.ts';
import { SOURCES, CONTENT_PERMISSIONS } from '../news-model.ts';
import relay from '../relay-config.ts';
import { ATOMSTR_RELAY } from '../atomstr-config.ts';

test('Android catalogue preserves all maintained editions, pinned identities and permissions', () => {
  const catalogue = androidCatalogue();
  assert.deepEqual(catalogue.relay, { pubkey: relay.pubkey, relays: relay.relays });
  assert.deepEqual(catalogue.atomstr.relays, [ATOMSTR_RELAY]);
  assert.deepEqual(catalogue.englishSources, SOURCES);
  assert.deepEqual(catalogue.contentPermissions, CONTENT_PERMISSIONS);
  assert.deepEqual(catalogue.editions.map(edition => edition.id), EDITIONS.map(edition => edition.locale));
  for (const edition of catalogue.editions) {
    assert.deepEqual(edition.sources, edition.id === 'en-US' ? SOURCES : EDITION_SOURCES[edition.id]);
    assert.equal(edition.preferenceKey, edition.id.startsWith('pt-') ? 'pt' : edition.id);
    assert.equal(edition.direction, edition.id === 'ar' ? 'rtl' : 'ltr');
    for (const [message, translated] of Object.entries(edition.strings)) {
      if (['Refresh', 'Try again', 'Read at source'].includes(message)) assert.ok(translated.trim());
      else assert.equal(translated, translator(edition.id)(message));
    }
  }
  assert.equal(catalogue.editions.find(edition => edition.id === 'pt-PT')!.strings['Loading news…'], 'A carregar notícias…');
  assert.equal(catalogue.editions.find(edition => edition.id === 'ar')!.strings['World news'], translator('ar')('World news'));
  assert.equal(catalogue.editions.find(edition => edition.id === 'ar')!.strings['Refresh'], 'تحديث');
  assert.equal(catalogue.editions.find(edition => edition.id === 'en-US')!.strings['Read at source'], 'Read at source');
  assert.equal(catalogueJson(), `${JSON.stringify(catalogue, null, 2)}\n`);
});

test('generated bundle is deterministic and drift checking rejects stale files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'android-catalogue-'));
  const destination = join(directory, 'nested', 'catalogue.json');
  try {
    await generateCatalogue(destination);
    assert.equal(await readFile(destination, 'utf8'), catalogueJson());
    await generateCatalogue(destination, true);
    await writeFile(destination, '{}');
    await assert.rejects(generateCatalogue(destination, true), /out of date/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('committed Android catalogue matches maintained web definitions', async () => {
  assert.equal(await readFile(CATALOGUE_PATH, 'utf8'), catalogueJson());
});

test('CLI generates and checks the default bundle, while imports have no side effects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'android-catalogue-cli-'));
  const script = resolve('scripts/generate-android-catalogue.ts');
  const loader = import.meta.resolve('tsx');
  const options = { cwd: directory, encoding: 'utf8' as const };
  try {
    execFileSync(process.execPath, ['--import', loader, '--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(script).href)})`], options);
    await assert.rejects(readFile(join(directory, CATALOGUE_PATH)), { code: 'ENOENT' });
    execFileSync(process.execPath, ['--import', loader, script], options);
    execFileSync(process.execPath, ['--import', loader, script, '--check'], options);
    assert.equal(await readFile(join(directory, CATALOGUE_PATH), 'utf8'), catalogueJson());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
