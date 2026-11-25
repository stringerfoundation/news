import { articleLink, NEWSWIRE_LIMIT, urlIdentity } from './news-model.ts';
import type { AtomstrSource, SourceState } from './relay/types.ts';

// These mirrors use the same RSS URLs as the signed English collection.
export const ENGLISH_ATOMSTR_SOURCES: readonly AtomstrSource[] = [
  { id: 'aljazeera', name: 'Al Jazeera', feeds: [{
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
    pubkey: 'da135401b0d0ecee2c78c6c74244328ce271faf57ec202b1d21d5e9885646170',
  }] },
  { id: 'dw', name: 'DW', feeds: [{
    url: 'https://rss.dw.com/rdf/rss-en-all',
    pubkey: '4b639d18916a8f4e15f50f8d01a81ab39ffbfded36d4a2a664d04fbba7b15079',
  }] },
];

export type EmbeddedAtomstr = Record<string, Pick<SourceState, 'stories' | 'lastSuccessAt'>>;
const maxAge = 36 * 60 * 60 * 1000;

export function withEnglishAtomstrFallback(
  displayed: Record<string, SourceState>,
  live: Record<string, SourceState>,
  embedded: EmbeddedAtomstr,
  now = Date.now(),
): Record<string, SourceState> {
  const sources = { ...displayed };
  for (const { id } of ENGLISH_ATOMSTR_SOURCES) {
    const cached = embedded[id];
    const collected = Date.parse(cached?.lastSuccessAt ?? '');
    if (!cached || !(collected >= now - maxAge && collected <= now)) continue;
    const primary = live[id];
    if (primary?.status === 'paused' || primary?.status === 'loading') continue;
    const previous = displayed[id]?.stories ?? [];
    const missing = primary?.status === 'success' ? primary.unavailable ?? 0 : NEWSWIRE_LIMIT;
    const limit = Math.min(missing, NEWSWIRE_LIMIT - previous.length);
    if (limit <= 0) continue;

    const known = new Set(previous.map(story => urlIdentity(articleLink(story.url))));
    const additions = [];
    for (const story of cached.stories) {
      const time = Date.parse(story.publishedAt ?? '');
      if (!(time >= now - maxAge && time <= now)) continue;
      const url = urlIdentity(articleLink(story.url));
      if (known.has(url)) continue;
      known.add(url);
      additions.push(story);
      if (additions.length >= limit) break;
    }
    if (!additions.length) continue;
    sources[id] = {
      ...(displayed[id] ?? { status: 'failure', error: 'Primary feed unavailable', attemptedAt: new Date(now).toISOString(), lastSuccessAt: null }),
      stories: [...previous, ...additions],
    };
  }
  return sources;
}
