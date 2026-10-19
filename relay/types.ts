export interface Story {
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
  stories: Story[];
  attemptedAt: string;
  lastSuccessAt: string | null;
  status: 'success' | 'failure' | 'paused';
  error: string | null;
  pending?: number;
  unavailable?: number;
}
export interface Snapshot {
  schemaVersion: number;
  generatedAt: string;
  sources: Record<string, SourceState>;
}
