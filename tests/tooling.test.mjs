import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('.');
async function directory(t) {
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
  await writeFile(`${dir}/notes.txt`, 'const =');
  const run = () =>
    spawnSync(process.execPath, [`${root}/scripts/check-syntax.mjs`], {
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
    'news-model.js',
    'index.html',
    'style.css',
    'app.js',
    'relay-config.js',
    'stringer-media.js',
    'assets',
  ])
    await cp(resolve(name), `${dir}/${name}`, { recursive: true });
  await writeFile(`${dir}/assets/stringer-thumbnails/private.txt`, 'synthetic forbidden asset');
  const result = spawnSync(process.execPath, [`${root}/scripts/build.mjs`], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected thumbnail: private.txt/);
});
test('browser helper honors an explicit Chrome path while enforcing headless mode', async (t) => {
  const { chromium } = await import('@playwright/test');
  const { launchBrowser } = await import('../scripts/browser.mjs');
  const old = process.env.CHROME_PATH;
  process.env.CHROME_PATH = '/synthetic/chrome';
  t.after(() => {
    if (old === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = old;
  });
  const marker = {};
  t.mock.method(chromium, 'launch', async (options) => {
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
  t.mock.method(process, 'exit', (code) => {
    assert.equal(code, 1);
    throw Error('Expected checker exit');
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(import('../scripts/check-syntax.mjs?terminated'), /Expected checker exit/);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});
