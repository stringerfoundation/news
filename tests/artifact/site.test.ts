import { EDITIONS } from '../../reader-locales.ts';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { load } from 'cheerio';
import { resolve, relative } from 'node:path';
async function walk(dir: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(dir)) {
    const path = `${dir}/${entry}`, stat = await lstat(path);
    assert.equal(stat.isSymbolicLink(), false, `No symlinks in Pages artifact: ${path}`);
    if (stat.isDirectory()) paths.push(...await walk(path)); else paths.push(path);
  }
  return paths;
}
test('Pages artifact contains only the public asset allowlist', async () => {
  const exact = new Set(['index.html', 'app.js', 'style.css', 'news-model.js', 'relay-config.js',
    'stringer-media.js', 'relay-reader.js', 'atomstr-reader.js', ...EDITIONS.filter(edition => edition.path).map(edition => `${edition.path}/index.html`), '.well-known/nostr.json', '.nojekyll', 'robots.txt',
    ...['stringer-logo.png','nostr-banner.png','favicon-16.png','favicon-32.png','favicon-192.png','favicon-180.png'].map(f => `assets/${f}`)]);
  const paths = (await walk('_site')).map(path => path.slice(6));
  for (const path of paths) assert.ok(exact.has(path) || /^assets\/stringer-thumbnails\/[a-zA-Z0-9-]+\.png$/.test(path), `Unexpected published file: ${path}`);
  for (const path of exact) assert.ok(paths.includes(path), `Missing public asset: ${path}`);
  assert.equal(paths.some(path => /(?:dashboard|backend|private|secrets|\.env|\.sqlite|\.csv|AGENTS|LICENSE|README)/i.test(path)), false);
  assert.match(await readFile('_site/robots.txt', 'utf8'), /Disallow:\s*$/m);
});
test('built HTML, module imports and Stringer photos resolve under a GitHub project path', async () => {
  const html = await readFile('_site/index.html', 'utf8'), $ = load(html);
  assert.equal($('meta[name="robots"]').attr('content'), 'index, follow');
  assert.equal($('base').length, 0, 'Worker owns the public base path');
  const urls = $('script[src],link[href],img[src]').toArray().map(el => $(el).attr('src') || $(el).attr('href'));
  for (const file of ['app.js','relay-reader.js','stringer-media.js','news-model.js']) {
    const js = await readFile(`_site/${file}`, 'utf8');
    for (const match of js.matchAll(/(?:from\s*|import\s*\()(['"])(\.\/[^'"\s]+)\1/g)) urls.push(match[2]);
  }
  // Resolve dynamically so the generated artifact is checked at runtime, outside source compilation.
  const mediaPath = '../../_site/stringer-media.js';
  const media: typeof import('../../stringer-media.ts') = await import(mediaPath);
  for (const story of media.STRINGER_MEDIA.values()) if (story.image) urls.push(story.image);
  for (const value of urls) {
    if (!value || !value.startsWith('./')) continue;
    const url = new URL(value, 'https://example.github.io/stringer-news/');
    assert.ok(url.pathname.startsWith('/stringer-news/'));
    const path = resolve('_site', url.pathname.slice('/stringer-news/'.length));
    assert.ok(!relative(resolve('_site'), path).startsWith('..'));
    await readFile(path);
  }
  for (const value of $('script[src],link[rel="stylesheet"]').toArray().map(el => $(el).attr('src') || $(el).attr('href')))
    if (value?.startsWith('./')) assert.match(value, /\?v=[a-f0-9]{16}$/, 'Versioned module and stylesheet URLs');
});

test('footer links the build timestamp to the exact source commit beside the GitHub icon', async () => {
  const $ = load(await readFile('_site/index.html', 'utf8'));
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const footer = $('#reader-build');
  assert.equal(footer.attr('hidden'), undefined);
  assert.equal(footer.find('.build-commit').attr('href'), `https://github.com/stringerfoundation/news/commit/${revision}`);
  assert.match(footer.find('.build-commit').text(), /^Build \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  assert.ok(Number.isFinite(Date.parse(footer.find('.build-commit time').attr('datetime') ?? '')));
  assert.equal(footer.find('.build-repository').attr('href'), 'https://github.com/stringerfoundation/news');
  assert.equal(footer.find('.build-repository svg').length, 1);
});
