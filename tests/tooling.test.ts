
import test, { type TestContext } from 'node:test';
import type { LaunchOptions } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, cp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('.');
async function directory(t: TestContext) {
  await mkdir('.test-output', { recursive: true });
  const dir = await mkdtemp(resolve('.test-output/tooling-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test('syntax checker scans nested modules, skips generated directories and rejects syntax errors', async (t) => {
  const dir = await directory(t);
  await mkdir(`${dir}/nested`);
  await mkdir(`${dir}/node_modules`);
  await writeFile(`${dir}/node_modules/bad.js`, 'const =');
  await writeFile(`${dir}/nested/good.mjs`, 'export const value = 1;');
  await writeFile(`${dir}/nested/good.ts`, 'export const typed: number = 1;');
  await writeFile(`${dir}/notes.txt`, 'const =');
  const run = () =>
    spawnSync(process.execPath, ['--import', 'tsx', `${root}/scripts/check-syntax.ts`], {
      cwd: dir,
      encoding: 'utf8',
    });
  assert.equal(run().status, 0);
  await writeFile(`${dir}/nested/bad.js`, 'const =');
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SyntaxError/);
});
test('build rejects unexpected thumbnail files before publication', async (t) => {
  const dir = await directory(t);
  for (const name of [
    'relay',
    'relay-reader.ts', 'atomstr-reader.ts', 'atomstr-config.ts', 'response.ts', 'public-assets.ts', 'publications.ts',
    'news-model.ts', 'english-atomstr.ts',
    'reader-locales.ts', 'edition-sources.ts', 'portuguese-sources.ts', 'swahili-publishers.ts',
    'locales', 'sources',
    'index.html',
    'style.css',
    'app.ts',
    'relay-config.ts',
    'stringer-media.ts',
    'assets', 'data', '.well-known',
  ])
    await cp(resolve(name), `${dir}/${name}`, { recursive: true });
  await writeFile(`${dir}/assets/stringer-thumbnails/private.txt`, 'synthetic forbidden asset');
  const result = spawnSync(process.execPath, ['--import', 'tsx', `${root}/scripts/build.ts`], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected thumbnail: private.txt/);
  await rm(`${dir}/assets/stringer-thumbnails/private.txt`);
  const snapshot = JSON.parse(await readFile('data/news.json', 'utf8'));
  for (const fresh of [false, true]) {
    // Advance the build clock independently of the committed sample's collection date.
    const now = Date.parse(snapshot.generatedAt) + (fresh ? 0 : 7 * 3600_000);
    await writeFile(`${dir}/clock.mjs`, `Date.now = () => ${now};`);
    await writeFile(`${dir}/data/news.json`, JSON.stringify(snapshot));
    const build = spawnSync(process.execPath, ['--import', './clock.mjs', '--import', 'tsx', `${root}/scripts/build.ts`], {
      cwd: dir, encoding: 'utf8', env: {...process.env, STRINGER_REQUIRE_FRESH_SNAPSHOT: '1'},
    });
    if (fresh) assert.equal(build.status, 0, build.stderr);
    else assert.match(build.stderr, /minutes old/);
  }
});
test('browser helper honors an explicit Chrome path while enforcing headless mode', async (t) => {
  const { chromium } = await import('@playwright/test');
  const { launchBrowser } = await import('../scripts/browser.ts');
  const old = process.env.CHROME_PATH;
  process.env.CHROME_PATH = '/synthetic/chrome';
  t.after(() => {
    if (old === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = old;
  });
  const marker = {};
  t.mock.method(chromium, 'launch', async (options: LaunchOptions) => {
    assert.equal(options.executablePath, '/synthetic/chrome');
    assert.equal(options.headless, true);
    assert.equal(options.timeout, 10);
    return marker;
  });
  assert.equal(await launchBrowser({ headless: false, timeout: 10 }), marker);
});
test('syntax checker treats a terminated child as failure', async (t) => {
  const child = (await import('node:child_process')).default;
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  t.mock.method(fs, 'readdir', async () => [{ name: 'fixture.js', isDirectory: () => false }]);
  t.mock.method(child, 'spawnSync', () => ({ status: null, signal: 'SIGTERM' }));
  t.mock.method(process, 'exit', (code: number) => {
    assert.equal(code, 1);
    throw Error('Expected checker exit');
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(import(new URL('../scripts/check-syntax.ts?terminated', import.meta.url).href), /Expected checker exit/);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
