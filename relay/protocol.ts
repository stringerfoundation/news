import { verifyEvent, type Event } from 'nostr-tools';
import { validateSnapshot, applyContentPermissions, normalizeSourceSet, SOURCES } from '../news-model.ts';
import type { Snapshot, Story } from './types.ts';
export const MANIFEST_KIND = 30078;
export const MANIFEST_KEY = 'stringer-news-v1';
export const GROUP_MARKER = 'stringer-group-v1';
export interface Manifest {
  groups?: Record<string, string>;
  assignments?: Record<string, string>;
  version: 1;
  generatedAt: string;
  sources: Record<
    string,
    {
      ids: string[];
      attemptedAt: string;
      lastSuccessAt: string | null;
      status: string;
      error: string | null;
      pending?: number;
    }
  >;
}
export function checkedEvent(event: Event, pubkey: string, kind: number): void {
  if (
    JSON.stringify(event).length > 500_000 ||
    event.pubkey !== pubkey ||
    event.kind !== kind ||
    !verifyEvent(event) ||
    event.created_at > Date.now() / 1000 + 60
  )
    throw new Error('Invalid relay event');
}
export function readManifest(event: Event, pubkey: string): Manifest {
  checkedEvent(event, pubkey, MANIFEST_KIND);
  if (
    event.tags.filter((t) => t[0] === 'd').length !== 1 ||
    !event.tags.some((t) => t[0] === 'd' && t[1] === MANIFEST_KEY)
  )
    throw new Error('Invalid manifest tag');
  const value = JSON.parse(event.content) as Manifest;
  if (
    value.version !== 1 ||
    typeof value.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    Date.parse(value.generatedAt) > Date.now() + 60_000 ||
    !value.sources
  )
    throw new Error('Invalid manifest');
  value.sources = normalizeSourceSet(value.sources, value.generatedAt, true);
  for (const source of SOURCES) {
    const entry = value.sources[source.id];
    if (
      !entry ||
      !Array.isArray(entry.ids) ||
      entry.ids.length > (source.id === 'stringer' ? 200 : 30) ||
      new Set(entry.ids).size !== entry.ids.length ||
      entry.ids.some((id) => typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id))
    )
      throw new Error('Invalid story references');
    if (
      entry.pending !== undefined &&
      (!Number.isInteger(entry.pending) || entry.pending < 0 || entry.pending > 200)
    )
      throw new Error('Invalid pending count');
  }
  if (value.groups !== undefined) {
    const ids = SOURCES.filter((source) => source.id !== 'stringer').flatMap(
      (source) => value.sources[source.id]!.ids,
    );
    value.groups =
      value.groups && typeof value.groups === 'object' && !Array.isArray(value.groups)
        ? Object.fromEntries(
            Object.entries(value.groups).filter(
              ([note, cluster]) =>
                ids.includes(note) && typeof cluster === 'string' && /^[0-9a-f]{64}$/.test(cluster),
            ),
          )
        : {};
  }
  if (value.assignments !== undefined) {
    const ids = Object.values(value.sources).flatMap((source) => source.ids);
    // Optional grouping cannot invalidate an otherwise usable article collection.
    value.assignments =
      value.assignments &&
      typeof value.assignments === 'object' &&
      !Array.isArray(value.assignments)
        ? Object.fromEntries(
            Object.entries(value.assignments).filter(
              ([note, reply]) =>
                ids.includes(note) && typeof reply === 'string' && /^[0-9a-f]{64}$/.test(reply),
            ),
          )
        : {};
  }
  return value;
}
export function readAssignment(event: Event, pubkey: string, noteId: string): string {
  checkedEvent(event, pubkey, 1);
  const markers = event.tags.filter((t) => t[0] === GROUP_MARKER);
  const roots = event.tags.filter((t) => t[0] === 'e');
  const cluster = markers[0]?.[1];
  if (
    markers.length !== 1 ||
    !cluster ||
    !/^[0-9a-f]{64}$/.test(cluster) ||
    roots.length !== 1 ||
    roots[0]?.[1] !== noteId ||
    roots[0]?.[3] !== 'root' ||
    !event.tags.some((t) => t[0] === 't' && t[1] === `stringer-event-${cluster.slice(0, 16)}`)
  )
    throw new Error('Invalid grouping assignment');
  return cluster;
}
export function assemble(
  manifestEvent: Event,
  events: Event[],
  pubkey: string,
  allowPartial = false,
): Snapshot {
  const manifest = readManifest(manifestEvent, pubkey);
  const byId = new Map(events.map((event) => [event.id, event]));
  const sources: Snapshot['sources'] = {};
  for (const source of SOURCES) {
    const entry = manifest.sources[source.id]!;
    const missing = entry.ids.filter((id) => !byId.has(id));
    const stories = entry.ids
      .filter((id) => !allowPartial || byId.has(id))
      .map((id) => {
        const event = byId.get(id);
        if (!event) throw new Error('Incomplete relay collection');
        checkedEvent(event, pubkey, 1);
        const tags = event.tags.filter((t) => t[0] === 'stringer');
        if (tags.length !== 1 || tags[0]![1] !== source.id || !tags[0]![2])
          throw new Error('Invalid story tag');
        const story = JSON.parse(tags[0]![2]!) as Story;
        if (!event.tags.some((t) => t[0] === 'r' && t[1] === story.url))
          throw new Error('Story URL mismatch');
        // Missing grouping metadata never makes an otherwise valid story unavailable.
        let clusterId: string | undefined =
          source.id !== 'stringer' ? manifest.groups?.[id] : undefined;
        const reply = byId.get(manifest.assignments?.[id] || '');
        if (manifest.groups === undefined && source.id !== 'stringer' && reply) {
          try {
            clusterId = readAssignment(reply, pubkey, id);
          } catch {
            /* Ignore invalid assignments. */
          }
        }
        const { clusterId: ignoredCluster, noteId: ignoredNote, ...original } = story;
        return { ...original, noteId: id, ...(clusterId ? { clusterId } : {}) };
      });
    sources[source.id] = {
      ...entry,
      stories,
      ...(missing.length && allowPartial ? { unavailable: missing.length } : {}),
      ...(source.id === 'stringer' && missing.length && !stories.length && allowPartial
        ? {
            status: 'failure',
            lastSuccessAt: null,
            error: 'Published stories temporarily unavailable from relays',
          }
        : {}),
    } as Snapshot['sources'][string];
  }
  if (
    allowPartial &&
    !Object.values(sources).some((source) => source.stories.length) &&
    Object.values(manifest.sources).some((source) => source.ids.length)
  )
    throw new Error('No published stories available');
  const clean = applyContentPermissions(
    validateSnapshot({ schemaVersion: 2, generatedAt: manifest.generatedAt, sources }),
  ) as Snapshot;
  // Group metadata is derived from verified events, never from publisher story JSON.
  for (const source of SOURCES) {
    clean.sources[source.id]!.stories.forEach((story, index) => {
      const verified = sources[source.id]!.stories[index]!;
      story.noteId = verified.noteId!;
      if (verified.clusterId) story.clusterId = verified.clusterId;
    });
  }
  return clean;
}
