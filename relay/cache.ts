import { validateEvent, type Event } from 'nostr-tools';
import { assemble } from './protocol.js';
import type { Snapshot } from './types.js';

const MAX_CACHE_LENGTH = 5_000_000;
const MAX_CACHE_EVENTS = 700;
interface CachedCollection {
  manifest: Event;
  stories: Event[];
  snapshot: Snapshot;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function event(value: unknown): value is Event {
  return record(value) && typeof value.id === 'string' && typeof value.sig === 'string' &&
    validateEvent(value);
}

// Browser storage is untrusted and optional. Only a verified collection may
// supply fallback stories or prevent an older network collection from replacing it.
export function parseCachedCollection(raw: string | null, pubkey: string): CachedCollection | null {
  if (!raw || raw.length > MAX_CACHE_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || !event(value.manifest) || !Array.isArray(value.stories) ||
      value.stories.length > MAX_CACHE_EVENTS || !value.stories.every(event)) return null;
    const snapshot = assemble(value.manifest, value.stories, pubkey, true);
    return { manifest: value.manifest, stories: value.stories, snapshot };
  } catch {
    return null;
  }
}

export function readCachedCollection(pubkey: string): CachedCollection | null {
  try {
    return parseCachedCollection(localStorage.getItem(`stringer-relay:${pubkey}`), pubkey);
  } catch {
    return null;
  }
}
