// Resolve public illustrations during publication, using the same signed votes as the editor.
import type { Event, Filter } from 'nostr-tools';
import { IMAGE_MARKER, VOTE_MARKER, newest, readCandidate, readFollows, selectImage, type Candidate } from '../relay/images.ts';

export async function publishedImages(
  owner: string, refs: Record<string, string[]>, query: (filter: Filter) => Promise<Event[]>,
) {
  const stories = Object.keys(refs);
  const images: Record<string, Candidate> = {};
  if (!stories.length) return images;
  const follows = new Set([owner]);
  for (const event of (await query({kinds: [3], authors: [owner], limit: 1})).sort(newest)) {
    try {
      for (const key of readFollows(event, owner)) follows.add(key);
      break;
    } catch { /* Try the next signed follow list. */ }
  }
  const ids = [...new Set(Object.values(refs).flat())];
  const candidates: Candidate[] = [];
  const addCandidates = (events: Event[]) => {
    for (const event of events) {
      try { candidates.push(readCandidate(event, owner, refs, true)); }
      catch { /* Ignore invalid image metadata. */ }
    }
  };
  for (let i = 0; i < ids.length; i += 20)
    addCandidates(await query({kinds: [1], authors: [owner], ids: ids.slice(i, i + 20)}));
  for (let i = 0; i < stories.length; i += 20) {
    const batch = stories.slice(i, i + 20);
    addCandidates(await query({kinds: [1], authors: [owner], '#e': batch, '#t': [IMAGE_MARKER], limit: 500}));
    const votes = await query({kinds: [1], '#e': batch, '#t': [VOTE_MARKER], limit: 1000});
    for (const id of batch) {
      const {winner} = selectImage(id, candidates, votes, follows, refs);
      if (winner) images[id] = winner;
    }
  }
  return images;
}
