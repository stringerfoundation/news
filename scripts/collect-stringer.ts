import { readFile, writeFile } from 'node:fs/promises';
import { SOURCES, uniqueStories } from '../news-model.ts';
import { EDITIONS } from '../reader-locales.ts';
import type { Story } from '../relay/types.ts';
import { parseStringer, type TextRequest } from './collect.ts';

const collection = SOURCES.find(source => source.id === 'stringer')!;

export async function embedStringerStories(site: string, request: TextRequest) {
  let stories: Story[];
  try {
    const html = await request(collection.url, { attempts: 1, allowedHosts: [new URL(collection.url).hostname] });
    stories = uniqueStories(parseStringer(html));
  } catch {
    console.warn('Courageous Stories unavailable for this build');
    return;
  }

  // The reader already has approved local images for these article URLs.
  const data = JSON.stringify(stories.map(story => ({ ...story, image: null }))).replaceAll('<', '\\u003c');
  for (const { path } of EDITIONS) {
    const file = path ? `${site}/${path}/index.html` : `${site}/index.html`;
    const html = await readFile(file, 'utf8');
    await writeFile(file, html.replace('</body>', () =>
      `<script id="stringer-stories" type="application/json">${data}</script></body>`));
  }
}
