import { SimplePool } from 'nostr-tools/pool';
import type { Event, EventTemplate, Filter } from 'nostr-tools';
import { checkedEvent } from './protocol.js';
import type { ReaderConfig } from './reader.js';

export const IMAGE_MARKER = 'stringer-image-v1';
export const VOTE_MARKER = 'stringer-image-vote-v1';
const hex = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 2000;
export interface CommonsImage {
  version: 1;
  url: string;
  filePage: string;
  title: string;
  alt: string;
  creator: string;
  attribution: string;
  license: string;
  licenseUrl: string;
}
export interface Candidate extends CommonsImage { id: string; storyId: string }
export interface Vote { storyId: string; candidateId: string | null }
export interface Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<Event>;
}
declare global { interface Window { nostr?: Signer } }
export const newest = (a: Event, b: Event) => b.created_at - a.created_at || a.id.localeCompare(b.id);
function root(event: Event): string {
  const tags = event.tags.filter(tag => tag[0] === 'e');
  if (tags.length !== 1 || !hex(tags[0]?.[1]) || tags[0]?.[3] !== 'root') throw new Error('Invalid image story reference');
  return tags[0][1];
}
function payload(event: Event, marker: string): Record<string, unknown> {
  const tags = event.tags.filter(tag => tag[0] === marker);
  if (tags.length !== 1 || tags[0]?.length !== 2) throw new Error('Invalid image metadata');
  const value: unknown = JSON.parse(tags[0][1]!);
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value as { version?: unknown }).version !== 1)
    throw new Error('Invalid image metadata version');
  return value as Record<string, unknown>;
}
function https(value: unknown): URL {
  if (typeof value !== 'string') throw new Error('Invalid image URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search)
    throw new Error('Invalid image URL');
  return url;
}
export function readCandidate(event: Event, pubkey: string, refs: Record<string, string[]>): Candidate {
  checkedEvent(event, pubkey, 1);
  const storyId = root(event);
  if (!refs[storyId]?.includes(event.id)) throw new Error('Unlisted candidate');
  const data = payload(event, IMAGE_MARKER);
  for (const field of ['title', 'alt', 'creator', 'attribution', 'license']) if (!text(data[field])) throw new Error('Missing image attribution');
  const image = https(data.url), page = https(data.filePage), license = https(data.licenseUrl);
  if (image.hostname !== 'upload.wikimedia.org' || !image.pathname.startsWith('/wikipedia/commons/') ||
      page.hostname !== 'commons.wikimedia.org' || !page.pathname.startsWith('/wiki/File:')) throw new Error('Not a Commons image');
  const cc = /^(CC-BY|CC-BY-SA)-(1\.0|2\.0|2\.5|3\.0|4\.0)$/.exec(String(data.license));
  const licensePath = cc ? `/licenses/${cc[1] === 'CC-BY' ? 'by' : 'by-sa'}/${cc[2]}/` :
    data.license === 'CC0-1.0' ? '/publicdomain/zero/1.0/' : data.license === 'PDM-1.0' ? '/publicdomain/mark/1.0/' : null;
  if (license.hostname !== 'creativecommons.org' || !licensePath || license.pathname !== licensePath) throw new Error('Unsupported image license');
  return { version: 1, id: event.id, storyId, url: image.href, filePage: page.href,
    title: data.title as string, alt: data.alt as string, creator: data.creator as string,
    attribution: data.attribution as string, license: data.license as string, licenseUrl: license.href };
}
export function readVote(event: Event, refs: Record<string, string[]>): Vote {
  checkedEvent(event, event.pubkey, 1);
  if (!event.tags.some(tag => tag[0] === 't' && tag[1] === VOTE_MARKER)) throw new Error('Not an image vote');
  const storyId = root(event), data = payload(event, VOTE_MARKER);
  if (!Object.hasOwn(refs, storyId) || (data.candidateId !== null && !hex(data.candidateId)))
    throw new Error('Invalid image choice');
  return { storyId, candidateId: data.candidateId as string | null };
}
export function readFollows(event: Event, pubkey: string): Set<string> {
  checkedEvent(event, pubkey, 3);
  const follows = new Set(event.tags.filter(tag => tag[0] === 'p' && hex(tag[1])).map(tag => tag[1]!));
  return follows;
}
export function selectImage(storyId: string, candidates: Candidate[], votes: Event[], follows: Set<string>, refs: Record<string, string[]>) {
  const latest = new Map<string, { event: Event; vote: Vote }>();
  for (const event of [...votes].sort(newest)) {
    if (!follows.has(event.pubkey) || latest.has(event.pubkey) || !event.tags.some(tag => tag[0] === 'e' && tag[1] === storyId)) continue;
    try {
      const vote = readVote(event, refs);
      if (vote.storyId === storyId) latest.set(event.pubkey, { event, vote });
    } catch { /* Invalid votes cannot affect a headline. */ }
  }
  const scores = candidates.filter(c => c.storyId === storyId).map(candidate => {
    const approvals = [...latest.values()].filter(v => v.vote.candidateId === candidate.id);
    return { candidate, count: approvals.length, first: Math.min(...approvals.map(v => v.event.created_at)) };
  }).sort((a, b) => b.count - a.count || a.first - b.first || a.candidate.id.localeCompare(b.candidate.id));
  return { winner: scores[0]?.count ? scores[0].candidate : null, scores, latest };
}
export function voteTemplate(storyId: string, candidateId: string | null, created_at = Math.floor(Date.now() / 1000)): EventTemplate {
  return { kind: 1, created_at, content: candidateId ? 'Approve this illustrative Commons image.' : 'Withdraw my image approval.',
    tags: [['e', storyId, '', 'root'], ['t', VOTE_MARKER], [VOTE_MARKER, JSON.stringify({ version: 1, candidateId })]] };
}

/** Independent, disposable session: image failures never delay news retrieval. */
export class ImageSession {
  private pool = new SimplePool();
  private closers: (() => void)[] = [];
  private voteClosers: (() => void)[] = [];
  private events = new Map<string, Event>();
  private follow: Event | undefined;
  private selections = new Map<string, ReturnType<typeof selectImage>>();
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly candidates = new Map<string, Candidate>();
  follows = new Set<string>();
  trustLive = false;
  private cacheKey: string;
  constructor(readonly config: ReaderConfig, readonly refs: Record<string, string[]>, private changed: () => void) {
    this.cacheKey = `stringer-images:${config.pubkey}`;
    try {
      const cached: Event[] = JSON.parse(localStorage.getItem(this.cacheKey) || '[]');
      if (Array.isArray(cached)) {
        const events = cached.slice(0, 20000).sort(newest);
        for (const event of events.filter(e => e.kind === 3)) this.receive(event, false);
        for (const event of events.filter(e => e.kind !== 3)) this.receive(event, false);
      }
    } catch { /* Cache is optional and never trusted without verification. */ }
    this.subscribe({ kinds: [3], authors: [config.pubkey], limit: 1 }, false, event => {
      try {
        readFollows(event, config.pubkey);
        if (!this.follow || newest(event, this.follow) <= 0) this.trustLive = true;
        this.receive(event, true);
      } catch { /* Ignore malformed trust lists. */ }
    });
    const ids = [...new Set(Object.values(refs).flat())];
    for (let i = 0; i < ids.length; i += 100)
      this.subscribe({ kinds: [1], authors: [config.pubkey], ids: ids.slice(i, i + 100), limit: 100 }, false);
    // Cached trust can display cached approvals; voting requires a live policy response.
    this.listenVotes();
  }
  private subscribe(filter: Parameters<SimplePool['subscribeMany']>[1], vote = false, receive = (event: Event) => this.receive(event, true)) {
    const sub = this.pool.subscribeMany(this.config.relays, filter, { onevent: receive });
    const close = () => { void sub.close(); };
    (vote ? this.voteClosers : this.closers).push(close);
  }
  private voteGeneration = 0;
  private listenVotes() {
    this.voteClosers.splice(0).forEach(close => close());
    const generation = ++this.voteGeneration;
    const authors = [...this.follows], stories = Object.keys(this.refs);
    if (!authors.length || !stories.length) return;
    // One live subscription per relay, plus batched latest-vote history filters.
    this.subscribe({ kinds: [1], authors, '#e': stories, '#t': [VOTE_MARKER], limit: 0 }, true);
    const total = stories.length * authors.length;
    let cursor = 0;
    const worker = async () => {
      while (!this.stopped && generation === this.voteGeneration) {
        // Generate only the next batch: large follow lists must not allocate the
        // complete story-by-author product or open thousands of subscriptions.
        const index = cursor++, offset = Math.floor(index / this.config.relays.length) * 50;
        if (offset >= total) return;
        const filters: Filter[] = Array.from({ length: Math.min(50, total - offset) }, (_, n) => {
          const pair = offset + n;
          return { kinds: [1], authors: [authors[pair % authors.length]!], '#e': [stories[Math.floor(pair / authors.length)]!], '#t': [VOTE_MARKER], limit: 1 };
        });
        const job = { url: this.config.relays[index % this.config.relays.length]!, filters };
        try {
          const relay = await this.pool.ensureRelay(job.url, { connectionTimeout: 5000 });
          if (this.stopped || generation !== this.voteGeneration) return;
          await new Promise<void>(resolve => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true; clearTimeout(timer); sub.close();
              this.voteClosers = this.voteClosers.filter(close => close !== finish);
              resolve();
            };
            const timer = setTimeout(finish, 6000);
            const sub = relay.subscribe(job.filters, { onevent: event => this.receive(event, true), oneose: finish, onclose: finish });
            this.voteClosers.push(finish);
          });
        } catch { /* Unavailable relays do not block other history batches. */ }
      }
    };
    for (let i = 0; i < 3; i++) void worker();
  }

  private receive(event: Event, live: boolean) {
    if (this.stopped) return;
    try {
      if (event.kind === 3) {
        const follows = readFollows(event, this.config.pubkey);
        if (this.follow && newest(this.follow, event) <= 0) { this.notify(); return; }
        this.follow = event; this.follows = follows;
        for (const [id, old] of this.events) if (old.kind === 3) this.events.delete(id);
        if (live) this.listenVotes();
      } else if (event.tags.some(t => t[0] === IMAGE_MARKER)) {
        const candidate = readCandidate(event, this.config.pubkey, this.refs);
        this.candidates.set(event.id, candidate);
      } else {
        const vote = readVote(event, this.refs);
        if (!this.follows.has(event.pubkey)) return;
        for (const [id, old] of this.events) {
          if (old.kind !== 1 || old.pubkey !== event.pubkey || !old.tags.some(t => t[0] === VOTE_MARKER)) continue;
          const prior = readVote(old, this.refs);
          if (prior.storyId !== vote.storyId) continue;
          if (newest(old, event) <= 0) return;
          this.events.delete(id);
        }
      }
      this.events.set(event.id, event);
      this.selections.clear();
      this.notify();
    } catch { /* Optional image metadata never invalidates news. */ }
  }
  private notify() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.stopped) return;
      try {
        const json = JSON.stringify([...this.events.values()]);
        if (json.length <= 5_000_000) localStorage.setItem(this.cacheKey, json);
        else localStorage.removeItem(this.cacheKey);
      } catch { /* Storage may be unavailable. */ }
      this.changed();
    }, 50);
  }
  selection(storyId: string) {
    let result = this.selections.get(storyId);
    if (!result) {
      result = selectImage(storyId, [...this.candidates.values()], [...this.events.values()].filter(e => e.kind === 1), this.follows, this.refs);
      this.selections.set(storyId, result);
    }
    return result;
  }
  async vote(signer: Signer, pubkey: string, storyId: string, candidateId: string | null) {
    if (!this.trustLive || !this.follows.has(pubkey) || await signer.getPublicKey() !== pubkey) throw new Error('This account is not currently eligible to approve images.');
    if (candidateId !== null && !this.candidates.has(candidateId)) throw new Error('Image candidate unavailable.');
    const prior = this.selection(storyId).latest.get(pubkey)?.event;
    if (prior && prior.created_at >= Math.floor(Date.now() / 1000)) throw new Error('Please wait a second before changing your vote.');
    const template = voteTemplate(storyId, candidateId);
    const event = await signer.signEvent(structuredClone(template));
    checkedEvent(event, pubkey, 1);
    if (JSON.stringify({ kind: event.kind, created_at: event.created_at, content: event.content, tags: event.tags }) !== JSON.stringify({ kind: template.kind, created_at: template.created_at, content: template.content, tags: template.tags })) throw new Error('Signer changed the requested vote.');
    const choice = readVote(event, this.refs);
    if (choice.candidateId !== null && !this.refs[storyId]?.includes(choice.candidateId)) throw new Error('Image candidate unavailable.');
    if (this.stopped || !this.trustLive || !this.follows.has(pubkey)) throw new Error('Voting eligibility changed. Please reconnect.');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.any(this.pool.publish(this.config.relays, event)), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Relays did not acknowledge this vote. Please retry.')), 6000); })]);
    } catch { throw new Error('Could not publish your vote. Please retry.'); }
    finally { clearTimeout(timeout); }
    this.receive(event, true);
  }
  close() {
    this.stopped = true;
    this.voteGeneration++;
    clearTimeout(this.timer);
    [...this.closers, ...this.voteClosers].forEach(close => close());
    this.pool.destroy();
  }
}
