import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { safeUrl } from '../news-model.ts';
import type { Snapshot, Story } from '../relay/types.ts';
import { readIllustration, type CommonsImage } from '../relay/illustration.ts';
import { EDITIONS } from '../reader-locales.ts';
import { firstScreenHeadlines } from './first-screen-headlines.ts';
import { fetchThumbnail } from './thumbnail-bytes.ts';

export interface PublishedThumbnail { file: string; image: CommonsImage; suggested: boolean }
export interface ThumbnailDependencies {
  download?: (url: string) => Promise<Buffer>;
  concurrency?: number;
  timeBudgetMs?: number;
  log?: (line: string) => void;
}
interface CachedImage { key: string; hash: string }
const keyFor = (story: Story, locale: string, approved: CommonsImage) => createHash('sha256')
  .update(JSON.stringify([story.title, story.url, locale, approved])).digest('hex');

/** Publish only owner-approved images for the first five world headlines in each edition. */
export async function publishHeadlineThumbnails(site: string, cacheDirectory: string, dependencies: ThumbnailDependencies = {}): Promise<void> {
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
  const jobs: (() => Promise<void>)[] = [];
  const selectedCounts = new Map<Snapshot, number>();
  for (const { locale, snapshot } of outputs) {
    const thumbnails: Record<string, PublishedThumbnail | null> = {};
    snapshot.thumbnails = thumbnails;
    const selectedStories = await firstScreenHeadlines(site, locale, snapshot);
    selectedCounts.set(snapshot, selectedStories.length);
    for (const story of selectedStories) {
      const storyUrl = safeUrl(story.url)!;
      const rawApproval = story.noteId ? news.illustrations?.[story.noteId] : undefined;
      if (!rawApproval) continue;
      thumbnails[storyUrl] = null;
      let approved: CommonsImage;
      try { approved = readIllustration(rawApproval as unknown as Record<string, unknown>); }
      catch { thumbnails[storyUrl] = null; continue; }
      const key = keyFor(story, locale, approved);
      activeKeys.add(key);
      jobs.push(async () => {
        try {
          let cached = cache.get(key);
          if (cached) {
            try {
              const cacheAsset = join(cacheDirectory, 'assets', `${cached.hash}.webp`);
              const bytes = await readFile(cacheAsset);
              if (createHash('sha256').update(bytes).digest('hex') === cached.hash) {
                const expectedFile = `assets/headline-thumbnails/${cached.hash}.webp`;
                const siteAsset = join(site, expectedFile);
                await mkdir(dirname(siteAsset), { recursive: true }); await copyFile(cacheAsset, siteAsset);
                currentAssets.add(`${cached.hash}.webp`);
                thumbnails[storyUrl] = { file: expectedFile, image: approved, suggested: false };
                return;
              }
            } catch { /* Missing cached bytes triggers a fresh download below. */ }
            cache.delete(key); cached = undefined;
          }
          if (Date.now() >= deadline) { thumbnails[storyUrl] = null; return; }
          const bytes = await download(approved.url);
          if (!Buffer.isBuffer(bytes) || !bytes.length) { thumbnails[storyUrl] = null; return; }
          const hash = createHash('sha256').update(bytes).digest('hex');
          const file = `assets/headline-thumbnails/${hash}.webp`;
          cache.set(key, { key, hash });
          const cacheAsset = join(cacheDirectory, 'assets', `${hash}.webp`);
          const siteAsset = join(site, file);
          await mkdir(dirname(cacheAsset), { recursive: true }); await mkdir(dirname(siteAsset), { recursive: true });
          await writeFile(cacheAsset, bytes); await copyFile(cacheAsset, siteAsset);
          currentAssets.add(`${hash}.webp`);
          thumbnails[storyUrl] = { file, image: approved, suggested: false };
        } catch { thumbnails[storyUrl] = null; }
      });
    }
  }
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
