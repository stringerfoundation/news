import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { homepageURL, artifactVersion, checkHomepage, runSmoke } from '../scripts/smoke-homepage.ts';

test('monitor accepts only an explicit HTTPS URL without credentials', () => {
  assert.equal(homepageURL('https://example.org/?view=news'), 'https://example.org/?view=news');
  for (const url of [undefined, '', 'not a url', 'http://example.org/', 'https://user:secret@example.org/'])
    assert.throws(() => homepageURL(url));
});

test('approved version comes from the built application URL', () => {
  const html = '<script src="./other.js"></script><script src="./app.js?v=1234567890abcdef"></script>';
  assert.equal(artifactVersion(html), '1234567890abcdef');
  for (const source of ['', '<script src="./app.js"></script>', '<script src="./app.js?v=bad"></script>'])
    assert.throws(() => artifactVersion(source), /Build the reader/);
});

test('invalid versions and budgets fail before launching a context', async () => {
  await assert.rejects(checkHomepage(null, 'https://example.org/', 'bad'));
  for (const options of [{ firstStoryMs: 0 }, { firstStoryMs: 10, completionMs: 1 }])
    await assert.rejects(checkHomepage(null, 'https://example.org/', '1234567890abcdef', options), /Invalid loading budgets/);
});

test('CLI fails before opening a browser when its destination is missing', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/smoke-homepage.ts'], {
    encoding: 'utf8', env: { ...process.env, READER_PUBLIC_URL: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set READER_PUBLIC_URL/);
});

test('monitor rejects invalid configuration and unavailable local artifacts', async () => {
  await assert.rejects(runSmoke({ env: {} }), /Set READER_PUBLIC_URL/);
  await assert.rejects(runSmoke({ env: { READER_PUBLIC_URL: 'https://example.org/', EXPECTED_READER_VERSION: 'bad' } }));
  await assert.rejects(runSmoke({ env: { READER_PUBLIC_URL: 'https://example.org/' },
    read: async () => { throw Error('No approved artifact'); } }), /No approved artifact/);
});
