import { readFile, writeFile } from 'node:fs/promises';
import { EDITIONS } from '../reader-locales.ts';
import { EDITION_SOURCES } from '../edition-sources.ts';
import { ENGLISH_ATOMSTR_SOURCES } from '../english-atomstr.ts';
import { NEWSWIRE_LIMIT } from '../news-model.ts';
import type { AtomstrSource, SourceState } from '../relay/types.ts';

export async function embedAtomstrHeadlines(
  site: string,
  collect: (sources: readonly AtomstrSource[]) => Promise<Record<string, SourceState>>,
) {
  // Read Portuguese once because the two editions share a catalogue.
  const catalogues = new Map<readonly AtomstrSource[], Record<string, SourceState>>();
  const generatedAt = new Date().toISOString();
  for (const {path, locale} of EDITIONS) {
    const sources = path ? EDITION_SOURCES[locale] : ENGLISH_ATOMSTR_SOURCES;
    if (!sources) continue;
    let entries = catalogues.get(sources);
    if (!entries) {
      entries = await collect(sources);
      catalogues.set(sources, entries);
    }
    const published = Object.fromEntries(sources.flatMap(source => {
      const entry = entries[source.id];
      if (!entry) return [];
      const stories = entry.stories.slice(0, NEWSWIRE_LIMIT).map(({title, url, publishedAt, mirroredVia}) =>
        ({title, url, publishedAt, mirroredVia, atomstr: true, image: null, summary: ''}));
      return [[source.id, {...entry, stories}]];
    }));
    if (path) await writeFile(`${site}/${path}/headlines.json`, JSON.stringify({generatedAt, sources: published}));
    const json = JSON.stringify(Object.fromEntries(Object.entries(published).flatMap(([id, entry]) =>
      entry.status === 'success' && entry.stories.length
        ? [[id, {lastSuccessAt: entry.lastSuccessAt, stories: entry.stories.slice(0, path ? 8 : NEWSWIRE_LIMIT)}]] : []
    ))).replaceAll('<', '\\u003c');
    const file = `${site}/${path ? `${path}/` : ''}index.html`;
    const html = await readFile(file, 'utf8');
    await writeFile(file, html.replace('</body>', () =>
      `<script id="atomstr-headlines" type="application/json">${json}</script></body>`));
  }
}
