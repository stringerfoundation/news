export interface Story {
  source?: string;
  mayRequireSubscription?: boolean;
  articles?: Story[];
  atomstr?: boolean;
  mirroredVia?: string;
  noteId?: string;
  clusterId?: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  credits?: string | undefined;
  publicationDate?: string | null;
  publicationSource?: string | null;
  headlineOnly?: boolean;
  image: { url: string; alt: string; credit: string } | null;
}
export interface SourceState {
  unavailable?: number;
  pending?: number;
  stories: Story[];
  attemptedAt: string;
  lastSuccessAt: string | null;
  status: 'success' | 'failure' | 'paused' | 'loading';
  error: string | null;
}
export interface Snapshot {
  schemaVersion: number;
  generatedAt: string;
  sources: Record<string, SourceState>;
}

export interface Source {
  id: string;
  name: string;
  mayRequireSubscription?: boolean;
}
export interface AtomstrFeed {
  readonly url: string;
  readonly pubkey: string;
  readonly social?: string;
}
export interface AtomstrSource extends Source {
  readonly homepage?: string;
  readonly feeds: readonly AtomstrFeed[];
}
