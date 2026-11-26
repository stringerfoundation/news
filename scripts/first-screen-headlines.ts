import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { sourcesForLocale } from '../edition-sources.ts';
import { withEnglishAtomstrFallback } from '../english-atomstr.ts';
import { SOURCES, worldStories, type SourceInfo } from '../news-model.ts';
import type { Snapshot } from '../relay/types.ts';
import { swahiliPublisher } from '../sources/sw.ts';
import { collectedSwahiliPublishers } from '../swahili-publishers.ts';

export async function firstScreenHeadlines(site: string, locale: string, snapshot: Pick<Snapshot, 'sources'>) {
  let sources = snapshot.sources;
  let registry: readonly SourceInfo[];
  if (locale === 'en-US') {
    const html = load(await readFile(join(site, 'index.html'), 'utf8'));
    const embedded = JSON.parse(html('#atomstr-headlines').text() || '{}');
    sources = withEnglishAtomstrFallback(sources, sources, embedded);
    registry = SOURCES;
  } else {
    registry = locale === 'sw' ? [swahiliPublisher, ...collectedSwahiliPublishers] : sourcesForLocale(locale);
  }
  return worldStories({ sources }, Object.keys(sources), registry).slice(0, 5);
}
