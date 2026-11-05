import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { load } from 'cheerio';
import { EDITIONS } from '../../reader-locales.ts';

test('staged edition routes share one UTC build time and publish no TypeScript or development files', () => {
  const publishedFiles: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      if (statSync(fullPath).isDirectory()) visit(fullPath);
      else publishedFiles.push(path.relative('_site', fullPath).split(path.sep).join('/'));
    }
  };
  visit('_site');

  const forbidden = publishedFiles.filter(file =>
    /\.tsx?$|\.map$|(^|\/)(?:AGENTS\.md|package(?:-lock)?\.json|tsconfig\.json|node_modules|tests|scripts|locales|openspec)(?:\/|$)/i.test(file),
  );
  assert.deepEqual(forbidden, []);

  const timestamps = EDITIONS.map(edition => {
    const relativePath = edition.path ? `${edition.path}/index.html` : 'index.html';
    assert.ok(publishedFiles.includes(relativePath), `staged route ${relativePath}`);
    const $ = load(readFileSync(path.join('_site', relativePath), 'utf8'));
    const time = $('#reader-build time');
    assert.ok(time.length, `${relativePath} build timestamp`);
    assert.match(time.text(), / UTC$/);
    assert.ok(time.attr('datetime')?.endsWith('Z'), `${relativePath} timestamp is UTC`);
    return time.attr('datetime');
  });
  assert.equal(new Set(timestamps).size, 1, 'all edition pages use the same build timestamp');
});
