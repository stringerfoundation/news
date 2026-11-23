import { readFile, writeFile } from 'node:fs/promises';
import { collectedSwahiliPublishers, SWAHILI_CONTENT_PERMISSIONS } from '../swahili-publishers.ts';
import { permittedStories } from '../news-model.ts';
import { parseFeed, type TextRequest } from './collect.ts';
import type { SourceState } from '../relay/types.ts';

export async function embedSwahiliHeadlines(path: string, request: TextRequest) {
  const html = await readFile(path, 'utf8');
  const attemptedAt = new Date().toISOString();
  const sources = await Promise.all(collectedSwahiliPublishers.map(async source => {
    let state: SourceState;
    try {
      const xml = await request(source.url, {attempts: 1, allowedHosts: [new URL(source.url).hostname]});
      const articleHosts: readonly string[] = source.articleHosts;
      const stories = parseFeed(xml)
        .filter(story => articleHosts.includes(new URL(story.url).hostname))
        .map(story => ({...story, url: story.url.replaceAll('&#038;', '&')}));
      state = {
        stories: permittedStories(source.id, stories, SWAHILI_CONTENT_PERMISSIONS),
        attemptedAt, lastSuccessAt: attemptedAt, status: 'success', error: null,
      };
    } catch {
      console.warn(`Kiswahili feed unavailable: ${source.name}`);
      state = {stories: [], attemptedAt, lastSuccessAt: null, status: 'failure', error: 'Publisher feed unavailable'};
    }
    return [source.id, state] as const;
  }));
  // Escape markup delimiters so publisher text cannot close the inert JSON script.
  const data = JSON.stringify(Object.fromEntries(sources)).replaceAll('<', '\\u003c');
  await writeFile(path, html.replace('</body>', () => `<script id="swahili-headlines" type="application/json">${data}</script></body>`));
}
