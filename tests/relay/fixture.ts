import { finalizeEvent, type Event } from 'nostr-tools';
import type { Snapshot } from '../../relay/types.js';
import { MANIFEST_KIND, MANIFEST_KEY, type Manifest } from '../../relay/protocol.js';
// Synthetic signed events created locally for tests. Nothing is published to relays.
export function publicBatch(snapshot: Snapshot, secret: Uint8Array) {
  const events: Event[] = [];
  const manifest: Manifest = { version: 1, generatedAt: snapshot.generatedAt, sources: {}, groups: {} };
  const created_at = Math.floor(Date.parse(snapshot.generatedAt) / 1000);
  for (const [source, state] of Object.entries(snapshot.sources)) {
    const ids = state.stories.map(story => {
      const event = finalizeEvent({ kind: 1, created_at, content: `${story.title}\n${story.url}`,
        tags: [['r', story.url], ['stringer', source, JSON.stringify(story)]] }, secret);
      events.push(event); return event.id;
    });
    const { stories: _, ...metadata } = state;
    manifest.sources[source] = { ...metadata, ids };
  }
  return { batch: { events, manifest: finalizeEvent({ kind: MANIFEST_KIND, created_at,
    tags: [['d', MANIFEST_KEY]], content: JSON.stringify(manifest) }, secret) } };
}
