import type { SourceState, Story } from '../relay/types.ts';
import { permittedStories, safeUrl } from '../news-model.js';
import { readResponseText } from '../response.js';

export const swahiliPublisher = {
  id: 'dw',
  name: 'DW Kiswahili',
  url: 'https://rss.dw.com/atom/rss-kis-all',
};

export async function refreshSwahiliSource(previous: SourceState): Promise<SourceState> {
  const attemptedAt = new Date().toISOString();
  try {
    const response = await fetch(swahiliPublisher.url, {
      cache: 'no-cache', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Publisher feed unavailable');
    const xml = new DOMParser().parseFromString(await readResponseText(response), 'application/xml');
    const feed = xml.documentElement;
    if (xml.querySelector('parsererror') || feed.namespaceURI !== 'http://www.w3.org/2005/Atom' || feed.localName !== 'feed' || feed.getAttribute('xml:lang') !== 'sw')
      throw new Error('Expected a Kiswahili Atom feed');
    const stories: Story[] = [];
    for (const entry of feed.querySelectorAll(':scope > entry')) {
      const title = entry.querySelector(':scope > title')?.textContent?.trim();
      const url = safeUrl(entry.querySelector(':scope > link[rel="alternate"][hreflang="sw"]')?.getAttribute('href'));
      if (!title || !url?.startsWith('https://www.dw.com/sw/')) continue;
      const published = entry.querySelector(':scope > published')?.textContent ?? '';
      const timestamp = Date.parse(published);
      stories.push({title, url, publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null, summary: '', image: null});
    }
    return {stories: permittedStories(swahiliPublisher.id, stories), attemptedAt, lastSuccessAt: attemptedAt, status: 'success', error: null};
  } catch {
    return {...previous, attemptedAt, status: 'failure', error: 'Publisher feed unavailable'};
  }
}
