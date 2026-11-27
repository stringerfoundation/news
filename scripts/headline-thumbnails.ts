import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { safeUrl } from '../news-model.ts';
import type { Snapshot, Story } from '../relay/types.ts';
import { readCommonsImage, readIllustration, type CommonsImage } from '../relay/illustration.ts';
import { clearArtist, commonsSubject, searchCommons } from '../relay/commons.ts';
import { EDITIONS } from '../reader-locales.ts';
import { firstScreenHeadlines } from './first-screen-headlines.ts';
import { fetchThumbnail } from './thumbnail-bytes.ts';
import { publicFetch } from './public-fetch.ts';

export interface PublishedThumbnail { file: string; image: CommonsImage; suggested: boolean }
export interface ThumbnailDependencies {
  search?: (query: string, request: typeof fetch, suggest: boolean, language: string) => Promise<CommonsImage[]>;
  request?: typeof fetch;
  download?: (url: string) => Promise<Buffer>;
  concurrency?: number;
  timeBudgetMs?: number;
  log?: (line: string) => void;
}
interface CachedImage { key: string; hash: string; image?: unknown }
const keyFor = (story: Story, locale: string, approved: CommonsImage | null) => createHash('sha256')
  .update(JSON.stringify([story.title, story.url, locale, approved])).digest('hex');
function readSuggestion(value: unknown): CommonsImage {
  const image = readCommonsImage(value as Record<string, unknown>);
  if (!clearArtist(image.creator) || !clearArtist(image.attribution)) throw new Error('Commons image has no clear artist credit');
  return image;
}

/** Publish credited Commons illustrations or owner-approved images for first-screen headlines. */
export async function publishHeadlineThumbnails(site: string, cacheDirectory: string, dependencies: ThumbnailDependencies = {}): Promise<void> {
  const search = dependencies.search ?? searchCommons;
  const request = dependencies.request ?? publicFetch;
  const download = dependencies.download ?? fetchThumbnail;
  const concurrency = Math.max(1, Math.min(4, Math.floor(dependencies.concurrency ?? 4)));
  const deadline = Date.now() + Math.max(0, dependencies.timeBudgetMs ?? 8 * 60_000);
  const newsPath = join(site, 'data', 'news.json');
  const news = JSON.parse(await readFile(newsPath, 'utf8')) as Snapshot;
  const outputs: { path: string; locale: string; snapshot: Snapshot }[] = [{ path: newsPath, locale: 'en-US', snapshot: news }];
  for (const { path, locale } of EDITIONS.filter(edition => edition.path)) {
    const file = join(site, path, 'headlines.json');
    try { outputs.push({ path: file, locale, snapshot: JSON.parse(await readFile(file, 'utf8')) as Snapshot }); }
    catch { /* Keep publishing other editions when a sidecar is absent. */ }
  }
  const cacheFile = join(cacheDirectory, 'index.json');
  let old: CachedImage[] = [];
  try {
    const data: unknown = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (Array.isArray(data)) old = data.filter((item): item is CachedImage => !!item && typeof item.key === 'string' && /^[0-9a-f]{64}$/.test(item.hash));
  } catch { /* Rebuild cache on first run or after damaged metadata. */ }
  const cache = new Map(old.map(item => [item.key, item]));
  const activeKeys = new Set<string>(), currentAssets = new Set<string>();
  const assetWrites = new Map<string, Promise<void>>();
  const jobs: (() => Promise<void>)[] = [];
  const expandedJobs: typeof jobs = [];
  const selectedCounts = new Map<Snapshot, number>();
  for (const { locale, snapshot } of outputs) {
    const thumbnails: Record<string, PublishedThumbnail | null> = {};
    snapshot.thumbnails = thumbnails;
    const selectedStories = await firstScreenHeadlines(site, locale, snapshot);
    selectedCounts.set(snapshot, selectedStories.length);
    for (const [index, story] of selectedStories.entries()) {
      const storyUrl = safeUrl(story.url)!;
      const rawApproval = story.noteId ? news.illustrations?.[story.noteId] : undefined;
      thumbnails[storyUrl] = null;
      let approved: CommonsImage | null = null;
      try { if (rawApproval) approved = readIllustration(rawApproval as unknown as Record<string, unknown>); }
      catch { /* Ignore invalid approval metadata and try a reusable Commons illustration. */ }
      const key = keyFor(story, locale, approved);
      activeKeys.add(key);
      const queue = index < 5 ? jobs : expandedJobs;
      queue.push(async () => {
        try {
          let cached = cache.get(key);
          if (cached) {
            try {
              const cachedImage = approved ?? (cached.image ? readSuggestion(cached.image) : null);
              const cacheAsset = join(cacheDirectory, 'assets', `${cached.hash}.webp`);
              const bytes = await readFile(cacheAsset);
              if (cachedImage && createHash('sha256').update(bytes).digest('hex') === cached.hash) {
                const expectedFile = `assets/headline-thumbnails/${cached.hash}.webp`;
                const siteAsset = join(site, expectedFile);
                await mkdir(dirname(siteAsset), { recursive: true }); await copyFile(cacheAsset, siteAsset);
                currentAssets.add(`${cached.hash}.webp`);
                thumbnails[storyUrl] = { file: expectedFile, image: cachedImage, suggested: !approved };
                return;
              }
            } catch { /* Missing cached bytes triggers a fresh download below. */ }
            cache.delete(key); cached = undefined;
          }
          if (Date.now() >= deadline) { thumbnails[storyUrl] = null; return; }
          const english = locale === 'en-US';
          const query = english ? commonsSubject(story.title) : story.title.trim().slice(0, 200);
          let candidates: CommonsImage[] = approved ? [approved] : [];
          if (!approved) {
            const results = await search(query,
              (input, init) => request(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), 'user-agent': 'StringerJournalismNews/1.0 (https://news.stringerjournalism.org)' } }),
              true, locale.split('-')[0]!);
            for (const candidate of results.slice(0, 5)) {
              try { candidates.push(readSuggestion(candidate)); }
              catch { /* Skip incomplete credits, unsupported licenses, and non-Commons records. */ }
            }
          }
          for (const image of candidates) {
            if (Date.now() >= deadline) break;
            try {
              const bytes = await download(image.url);
              if (!Buffer.isBuffer(bytes) || !bytes.length) continue;
              const hash = createHash('sha256').update(bytes).digest('hex');
              const file = `assets/headline-thumbnails/${hash}.webp`;
              cache.set(key, { key, hash, ...(!approved ? { image } : {}) });
              const cacheAsset = join(cacheDirectory, 'assets', `${hash}.webp`);
              const siteAsset = join(site, file);
              let assetWrite = assetWrites.get(hash);
              if (!assetWrite) {
                assetWrite = (async () => {
                  await mkdir(dirname(cacheAsset), { recursive: true });
                  let existing: Buffer | null = null;
                  try { existing = await readFile(cacheAsset); } catch { /* Write first copy. */ }
                  if (!existing || createHash('sha256').update(existing).digest('hex') !== hash) await writeFile(cacheAsset, bytes);
                })();
                assetWrites.set(hash, assetWrite);
              }
              await assetWrite;
              await mkdir(dirname(siteAsset), { recursive: true }); await copyFile(cacheAsset, siteAsset);
              currentAssets.add(`${hash}.webp`);
              thumbnails[storyUrl] = { file, image, suggested: !approved };
              return;
            } catch { /* Try the next validated Commons result. */ }
          }
          thumbnails[storyUrl] = null;
        } catch { thumbnails[storyUrl] = null; }
      });
    }
  }
  jobs.push(...expandedJobs);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) await jobs[next++]!();
  }));
  await mkdir(cacheDirectory, { recursive: true });
  for (const key of cache.keys()) if (!activeKeys.has(key)) cache.delete(key);
  await writeFile(cacheFile, JSON.stringify([...cache.values()]));
  const cacheAssets = join(cacheDirectory, 'assets');
  for (const directory of [join(site, 'assets', 'headline-thumbnails'), cacheAssets]) {
    try { for (const name of await readdir(directory)) if (!currentAssets.has(name)) await rm(join(directory, name), { force: true }); }
    catch { /* Empty directories are valid when no approved image is available. */ }
  }
  for (const output of outputs) await writeFile(output.path, JSON.stringify(output.snapshot));
  for (const output of outputs) {
    const thumbnails = output.snapshot.thumbnails!;
    const total = selectedCounts.get(output.snapshot)!;
    const hits = Object.values(thumbnails).filter(Boolean).length;
    (dependencies.log ?? console.log)(`Headline thumbnails ${output.locale}: ${hits}/${total}`);
  }
}
