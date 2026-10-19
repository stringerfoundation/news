import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const builtAt = new Date().toISOString();
await rm('_site', { recursive: true, force: true });
await mkdir('_site/assets/stringer-thumbnails', { recursive: true });
await mkdir('_site/.well-known', { recursive: true });
await build({ entryPoints: ['relay-reader.ts'], outfile: '_site/relay-reader.js', bundle: true,
  platform: 'browser', format: 'esm', target: 'es2022' });
const files = ['index.html', 'style.css', 'app.js', 'news-model.js', 'relay-config.js', 'stringer-media.js'];
for (const file of files.filter(file => !file.endsWith('.js'))) await copyFile(file, `_site/${file}`);
await build({ entryPoints: ['app.ts', 'news-model.ts', 'relay-config.ts', 'stringer-media.ts'],
  outdir: '_site', platform: 'browser', format: 'esm', target: 'es2022' });
for (const file of ['stringer-logo.png', 'nostr-banner.png', 'favicon-16.png', 'favicon-32.png', 'favicon-192.png', 'favicon-180.png'])
  await copyFile(`assets/${file}`, `_site/assets/${file}`);
for (const file of await readdir('assets/stringer-thumbnails')) {
  if (!/^[a-zA-Z0-9-]+\.png$/.test(file)) throw new Error(`Unexpected thumbnail: ${file}`);
  await copyFile(`assets/stringer-thumbnails/${file}`, `_site/assets/stringer-thumbnails/${file}`);
}
await copyFile('.well-known/nostr.json', '_site/.well-known/nostr.json');
await writeFile('_site/.nojekyll', '');
await writeFile('_site/robots.txt', 'User-agent: *\nDisallow: /\n');
let html = await readFile('_site/index.html', 'utf8');
html = html.replace('<head>', '<head>\n  <meta name="robots" content="noindex, nofollow, noarchive, noimageindex" />');
html = html.replace('<p id="reader-build" class="build-info" hidden>Build <time></time>',
  `<p id="reader-build" class="build-info">Build <time datetime="${builtAt}">${builtAt.slice(0, 16).replace('T', ' ')} UTC</time>`);
await writeFile('_site/index.html', html);
const versioned = [...files, 'relay-reader.js'];
const hash = createHash('sha256');
for (const file of versioned) hash.update(file).update(await readFile(`_site/${file}`));
const version = hash.digest('hex').slice(0, 16);
for (const file of versioned.filter(file => /\.(html|js)$/.test(file))) {
  const content = await readFile(`_site/${file}`, 'utf8');
  await writeFile(`_site/${file}`, content.replace(
    /(["'])\.\/([a-zA-Z0-9-]+\.(?:js|css))(?:\?[^"']*)?\1/g,
    (_, quote, asset) => `${quote}./${asset}?v=${version}${quote}`,
  ));
}
