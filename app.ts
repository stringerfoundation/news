import { readResponseText } from './response.js';
import type { SourceState, Snapshot } from './relay/types.js';
import type { DisplayStory } from './news-model.js';
import type { FeedLoadTiming } from './relay/reader.js';
import { localeForLanguage, translator } from './reader-locales.ts';
import { sourcesForLocale } from './edition-sources.ts';
import { SOURCES, CONTENT_PERMISSIONS, applyContentPermissions, safeUrl, safeImageUrl, validateSnapshot, worldStories, formatLocalDateTime, formatPublicationDate } from './news-model.js';
import relayConfig from './relay-config.js';
import { STRINGER_MEDIA } from './stringer-media.js';
function requiredElement<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing reader element: ${selector}`);
  return node;
}
const locale = localeForLanguage(document.documentElement.lang);
const mirrorSources = sourcesForLocale(locale);
const atomstrEdition = mirrorSources.length > 0;
const t = translator(locale);
// The existing homepage proxy only exposes the English reader's asset allowlist.
if (document.querySelector('base[href="/news-assets/"]')) requiredElement('.edition-switcher').hidden = true;
const menuToggle = requiredElement('.header-menu-toggle');
const headerMenu = requiredElement('#header-menu');
function setHeaderMenu(open: boolean) {
  headerMenu.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', t(open ? 'Close menu' : 'Open menu'));
}
menuToggle.addEventListener('click', () => setHeaderMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    setHeaderMenu(false); menuToggle.focus();
  }
});
matchMedia('(max-width: 920px)').addEventListener('change', () => setHeaderMenu(false));
const feedback = requiredElement('#refresh-status');
const publisherSources = atomstrEdition ? mirrorSources : SOURCES.filter(source => source.id !== 'stringer');
const sourcePreferenceKey = `stringer-disabled-sources-${locale.startsWith('pt-') ? 'pt' : locale}-v1`;
let disabledSources = new Set<string>();
try {
  const saved = atomstrEdition ? JSON.parse(localStorage.getItem(sourcePreferenceKey) || '[]') : [];
  if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
    disabledSources = new Set(saved.filter(id => publisherSources.some(source => source.id === id)));
  }
} catch { /* Preferences are optional when storage is unavailable. */ }
const selectedSources = (): readonly string[] => publisherSources.filter(source => !disabledSources.has(source.id)).map(source => source.id);
const sourceOptions = document.querySelector<HTMLElement>('#source-options');
for (const source of atomstrEdition ? publisherSources : []) {
  const label = element('label');
  const checkbox = element('input');
  checkbox.type = 'checkbox'; checkbox.value = source.id;
  checkbox.checked = !disabledSources.has(source.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) disabledSources.delete(source.id); else disabledSources.add(source.id);
    updateSourcePreferences();
  });
  label.append(checkbox, document.createTextNode(source.name)); sourceOptions?.append(label);
}
function enableAllSources() { disabledSources.clear(); updateSourcePreferences(); }
document.querySelector('#enable-all-sources')?.addEventListener('click', enableAllSources);
function updateSourcePreferences() {
  try { localStorage.setItem(sourcePreferenceKey, JSON.stringify([...disabledSources])); } catch { /* In-memory choices still work. */ }
  updateSourceControls();
  if (snapshot) renderWorld();
}
function updateSourceControls() {
  if (!atomstrEdition) return;
  requiredElement('#source-count').textContent = t('{enabled} of {total} enabled', {enabled: selectedSources().length, total: publisherSources.length});
  for (const checkbox of sourceOptions?.querySelectorAll('input') || []) checkbox.checked = !disabledSources.has(checkbox.value);
  requiredElement<HTMLButtonElement>('#enable-all-sources').disabled = disabledSources.size === 0;
}
updateSourceControls();
const sourceSearch = document.querySelector<HTMLInputElement>('#source-search');
if (sourceSearch) {
  sourceSearch.hidden = publisherSources.length <= 12;
  sourceSearch.setAttribute('aria-label', t('Search sources'));
  sourceSearch.placeholder = t('Search sources');
  sourceSearch.addEventListener('input', () => {
    const query = sourceSearch.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const label of sourceOptions!.querySelectorAll<HTMLLabelElement>('label'))
      label.hidden = !(label.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query);
    requiredElement('#no-matching-sources').hidden = [...sourceOptions!.querySelectorAll<HTMLLabelElement>('label')].some(label => !label.hidden);
  });
}
const interval = 5 * 60 * 1000;
let snapshot: Snapshot | null = null;
// Current collection metadata stays intact; fallback stories are a display concern.
const retainedSources = new Map<string, SourceState>();
function displayedSnapshot(): Snapshot {
  return { ...snapshot!, sources: Object.fromEntries(Object.entries(snapshot!.sources).map(([id, source]) =>
    [id, retainedSources.get(id) ?? source])) };
}
let loading = false;
let lastAttempt = 0;
let loadStarted = 0;
let loadDuration = 0;
let loadOutcome = '';
let loadStage = '';
let feedTimings: Record<string, FeedLoadTiming> = {};
// Per-page random ranks keep the complete collection stable during polling.
const stringerOrder = new Map<string, number>();
function shuffledStringerStories(stories: DisplayStory[]) {
  for (const story of stories) {
    if (!stringerOrder.has(story.url)) stringerOrder.set(story.url, Math.random());
  }
  return [...stories].sort((a, b) => stringerOrder.get(a.url)! - stringerOrder.get(b.url)!);
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function renderStories(target: HTMLElement, stories: DisplayStory[], emptyMessage: string) {
  target.replaceChildren();
  const usePlaceholder = target.id === 'stringer-news';
  const wire = target.id === 'world-news';
  for (const [index, story] of stories.entries()) {
    const url = safeUrl(story.url); if (!url) continue;
    const approvedMedia = usePlaceholder ? STRINGER_MEDIA.get(url) : null;
    const localImage = CONTENT_PERMISSIONS.stringer.images && approvedMedia?.image
      ? (locale !== 'en-US' ? new URL(approvedMedia.image, import.meta.url).href : approvedMedia.image)
      : null;
    const article = element('article', '', 'story');
    article.dir = 'auto';
    const body = element('div', '', 'story-body');
    const showPlaceholder = () => {
      const placeholder = element('div', '', 'story-media story-placeholder');
      placeholder.setAttribute('aria-hidden', 'true');
      article.classList.add('with-image');
      article.prepend(placeholder);
    };
    // Publisher photos stay hidden, regardless of URL parameters or stored metadata.
    const imageData = wire ? null : story.image;
    const imageUrl = wire ? null : safeImageUrl(imageData?.url) || localImage;
    if (imageUrl) {
      const figure = element('figure', '', 'story-media');
      const image = element('img');
      image.alt = imageData?.alt || '';
      image.width = 240; image.height = 240;
      image.loading = index === 0 ? 'eager' : 'lazy';
      image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
      let triedLocal = imageUrl === localImage;
      image.addEventListener('error', () => {
        if (localImage && !triedLocal) {
          triedLocal = true;
          image.src = localImage;
          return;
        }
        const placeholder = element('div', '', 'story-placeholder');
        placeholder.setAttribute('aria-hidden', 'true');
        image.replaceWith(placeholder);
      });
      image.src = imageUrl;
      if (wire) {
        figure.classList.add('wire-thumbnail');
        const imageLink = element('a');
        imageLink.href = url; imageLink.target = '_blank'; imageLink.rel = 'noopener noreferrer';
        imageLink.setAttribute('aria-label', t('Read {title} at the original source', {title: story.title}));
        imageLink.append(image);
        figure.append(imageLink);
      } else figure.append(image);
      if (imageData?.credit) figure.append(element('figcaption', imageData.credit));
      article.classList.add('with-image'); article.append(figure);
    } else if (usePlaceholder) {
      showPlaceholder();
    }
    const link = element('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append(element('h3', story.title)); body.append(link);
    if (story.credits) body.append(element('p', story.credits, 'credits'));
    if (story.summary) body.append(element('p', story.summary, 'summary'));
    const meta = element('div', '', 'meta');
    meta.append(element('span', story.source || new URL(url).hostname.replace(/^www\./, ''), 'source'));
    if (story.mirroredVia) meta.append(element('span', t('via {network} / Atomstr', {network: story.mirroredVia}), 'mirror-provenance'));
    // The publisher may still serve an older signed collection; the owner confirmed this exact reel's date.
    const reviewedDate = target.id === 'stringer-news' && story.url === 'https://www.instagram.com/reel/DMsRo8JNRY8/?igsh=MWc5aXJiZml4c2l4cA==' ? '2025-07-29' : null;
    const publishedAt = story.publishedAt || approvedMedia?.publishedAt;
    if (publishedAt) {
      const time = element('time', formatLocalDateTime(publishedAt, locale));
      time.title = t(story.atomstr ? 'Atomstr mirror timestamp ({zone})' : 'Local time ({zone})', {zone: Intl.DateTimeFormat().resolvedOptions().timeZone});
      time.dateTime = publishedAt; meta.append(time);
    } else if (story.publicationDate || approvedMedia?.publicationDate || reviewedDate) {
      const publicationDate = story.publicationDate || approvedMedia?.publicationDate || reviewedDate;
      const time = element('time', formatPublicationDate(publicationDate, locale));
      time.dateTime = publicationDate!; time.title = t('Publication date; source does not provide a confirmed time zone and time'); meta.append(time);
    } else if (story.credits) {
      meta.append(element('span', t('Publication date unavailable')));
    }
    if (meta.querySelector('time')) {
      const separator = element('span', '·'); separator.setAttribute('aria-hidden', 'true');
      meta.firstElementChild!.after(separator);
    }
    body.append(meta);
    article.append(body); target.append(article);
  }
  if (!target.children.length && emptyMessage) target.append(element('p', emptyMessage, 'empty'));
}
const mobileLayout = matchMedia('(max-width: 767px)');
const sections = [
  { list: requiredElement('#world-news'), button: requiredElement('#world-more'), more: 'Show more headlines', fewer: 'Show fewer headlines', expanded: false },
  { list: requiredElement('#stringer-news'), button: requiredElement('#stringer-more'), more: 'Show more courageous stories', fewer: 'Show fewer courageous stories', expanded: false },
];
function updateStoryVisibility() {
  for (const section of sections) {
    const cards = [...section.list.querySelectorAll('article')];
    cards.forEach((card, index) => { card.hidden = mobileLayout.matches && !section.expanded && index >= 5; });
    section.button.hidden = !mobileLayout.matches || cards.length <= 5;
    section.button.setAttribute('aria-expanded', String(section.expanded));
    section.button.textContent = t(section.expanded ? section.fewer : section.more);
    section.button.setAttribute('aria-label', section.button.textContent || '');
  }
  if (!mobileLayout.matches) {
    const stringer = requiredElement('#stringer-news');
    if (!stringer.querySelector('article')) return;
    const bottom = stringer.getBoundingClientRect().bottom;
    let reachedEnd = false;
    // Keep complete headlines through the end of the Courageous Stories column.
    for (const card of requiredElement('#world-news').querySelectorAll('article')) {
      card.hidden = reachedEnd;
      if (!reachedEnd && card.getBoundingClientRect().bottom >= bottom) reachedEnd = true;
    }
  }
}
for (const section of sections) {
  section.button.addEventListener('click', () => {
    section.expanded = !section.expanded;
    updateStoryVisibility();
  });
}
mobileLayout.addEventListener('change', updateStoryVisibility);
function renderStatuses() {
  const relayStatus = requiredElement('#relay-status');
  const relayDetails = requiredElement('#relay-status-details');
  relayDetails.replaceChildren();
  const notes = [];
  const seconds = ((loading ? performance.now() - loadStarted : loadDuration) / 1000).toFixed(1);
  const timing = loading ? t('Loading · {seconds} s elapsed', {seconds}) : loadOutcome ? t('{outcome} in {seconds} s', {outcome: t(loadOutcome), seconds}) : '';
  if (timing) notes.push(loading ? t('{stage} Total elapsed: {seconds} s.', {stage: loadStage, seconds}) : t('Latest feed load: {timing}.', {timing}));
  if (Object.keys(feedTimings).length) {
    notes.push(t('Story retrieval from news relays:'));
    for (const source of SOURCES) {
      const feed = feedTimings[source.id];
      if (!feed) continue;
      const elapsed = ((feed.durationMs ?? performance.now() - feed.startedAt) / 1000).toFixed(1);
      const state = feed.state === 'loading' && !loading ? 'partial' : feed.state;
      const description = state === 'empty' ? t('no published stories')
        : state === 'loaded' ? t('loaded in {seconds} s', {seconds: elapsed})
        : state === 'loading' ? t('loading · {seconds} s elapsed · {received}/{total} stories', {seconds: elapsed, received: feed.received, total: feed.total})
        : t('{received}/{total} stories received after {seconds} s', {seconds: elapsed, received: feed.received, total: feed.total});
      notes.push(`${source.name} · ${description}`);
    }
  }
  if (snapshot) for (const group of ['world', 'stringer']) {
    const target = requiredElement(`#${group}-status`); target.replaceChildren();
    const sources = group === 'stringer' ? SOURCES.filter(s => s.id === 'stringer') : publisherSources.filter(s => !disabledSources.has(s.id));
    for (const source of sources) {
      const entry = snapshot.sources[source.id]!;
      if (entry.status === 'paused') continue;
      const retained = retainedSources.get(source.id);
      if (retained) notes.push(`${source.name} · Showing ${retained.stories.length} previously collected stories${retained.lastSuccessAt ? ` from ${formatLocalDateTime(retained.lastSuccessAt)}` : ''}.`);
      if (relayConfig.enabled) {
        const counts = [];
        if ((entry.unavailable ?? 0) > 0 && !loading) counts.push(t('{count} unavailable', {count: entry.unavailable!}));
        if ((entry.pending ?? 0) > 0) counts.push(t('{count} queued', {count: entry.pending!}));
        if (counts.length) notes.push(`${source.name} · ${counts.join(' · ')}`);
      }
      if (entry.status === 'failure' && !(loading && entry.unavailable)) target.append(element('p', t('{source}: refresh unavailable.{retained}', {source: source.name, retained: t((retained?.stories.length || entry.stories.length) ? ' Showing previously collected stories.' : ' No stories available.')}), 'warning'));
    }
  }
  if (atomstrEdition) {
    const target = requiredElement('#world-status');
    const warnings = [...target.children];
    if (warnings.length) {
      const details = element('details');
      details.append(element('summary', t('Unavailable sources ({count})', {count: warnings.length})), ...warnings);
      target.replaceChildren(details);
    }
  }
  for (const note of notes) relayDetails.append(element('p', note));
  relayStatus.hidden = notes.length === 0;
  const summary = relayStatus.querySelector('summary')!;
  summary.textContent = timing ? t('Feed status · {timing}', {timing: locale === 'en-US' ? timing.toLowerCase() : timing}) : t('Feed status');
  summary.title = notes.join('\n');
}
function renderWorld() {
  if (!snapshot) return;
  const current = snapshot;
  const selected = selectedSources();
  const worldPaused = selected.length > 0 && selected.every(id => current.sources[id]!.status === 'paused');
  const list = requiredElement('#world-news');
  const stories = worldStories(displayedSnapshot(), selected, publisherSources);
  renderStories(list, atomstrEdition ? stories.slice(0, 300) : stories,
    !selected.length ? t('No sources selected.') : loading ? '' : worldPaused ? t('Global headlines are currently unavailable.') : t('No headlines available in this collection.'));
  if (!selected.length) {
    const button = element('button', t('Enable all'), 'enable-all-empty');
    button.type = 'button'; button.addEventListener('click', enableAllSources); list.append(button);
  }
  if (worldPaused && !atomstrEdition) {
    const links = element('p', '', 'publisher-links');
    for (const { id, name, homepage, linkLabel } of SOURCES.filter(source => source.id !== 'stringer')) {
      if (!selected.includes(id)) continue;
      const link = element('a', linkLabel || name); link.href = homepage; link.target = '_blank'; link.rel = 'noopener noreferrer';
      if (links.childNodes.length) links.append(document.createTextNode(' · '));
      links.append(link);
    }
    list.append(links);
  }
  renderStatuses();
  updateStoryVisibility();
}
function render() {
  if (!snapshot) return;
  renderStories(requiredElement('#stringer-news'), shuffledStringerStories(displayedSnapshot().sources.stringer!.stories), loading ? '' : t('Courageous stories are currently unavailable. Visit the Stringer collection below.'));
  renderWorld();
}
async function load() {
  if (atomstrEdition) return loadAtomstr();
  if (loading) return;
  loading = true; lastAttempt = Date.now();
  loadStarted = performance.now();
  loadStage = t(snapshot ? 'Checking for updates…' : 'Loading news…');
  loadOutcome = '';
  feedTimings = {};
  renderStatuses();
  const loadTimer = setInterval(renderStatuses, 1000);
  document.querySelectorAll('.story-list').forEach(list => list.setAttribute('aria-busy', 'true'));
  feedback.textContent = '';
  try {
    let next;
    if (relayConfig.enabled) {
      const reader = await import('./relay-reader.js');
      if (!snapshot) {
        snapshot = reader.cachedRelaySnapshot(relayConfig);
        if (snapshot) render();
      }
      next = await reader.readRelaySnapshot(relayConfig, message => {
        const retry = message.match(/^Received (\d+) published notes\. Retrying (\d+) missing notes…$/);
        loadStage = retry ? t('Received {received} published notes. Retrying {missing} missing notes…', {received: retry[1]!, missing: retry[2]!}) : t(message);
        renderStatuses();
        console.info('[Stringer reader]', message);
      }, partial => {
        if (snapshot && Date.parse(partial.generatedAt) < Date.parse(snapshot.generatedAt)) return;
        // Preserve already displayed stories while the rest of the update arrives.
        for (const source of SOURCES) {
          const current = partial.sources[source.id]!;
          const previous = retainedSources.get(source.id) ?? snapshot?.sources[source.id];
          if (previous && current.status !== 'paused' && previous.stories.length > current.stories.length)
            retainedSources.set(source.id, previous);
          else retainedSources.delete(source.id);
        }
        snapshot = partial;
        render();
      }, timings => {
        feedTimings = timings;
        renderStatuses();
      });
    } else {
      const response = await fetch(new URL('./data/news.json', import.meta.url), { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      next = applyContentPermissions(validateSnapshot(JSON.parse(await readResponseText(response))));
    }
    if (snapshot && Date.parse(next.generatedAt) < Date.parse(snapshot.generatedAt)) throw new Error('Older snapshot returned');
    retainedSources.clear();
    snapshot = next; render();
    loadOutcome = 'Loaded';
    feedback.textContent = '';
  } catch (error) {
    loadOutcome = 'Failed';
    console.error('[Stringer reader] Collection refresh failed:', error);
    feedback.textContent = t(snapshot ? 'Could not check for updates. Keeping the previously loaded collection.' : 'The news collection is unavailable. We’ll retry automatically.');
    if (!snapshot) {
      requiredElement('#world-status').textContent = t('Headlines unavailable.');
      requiredElement('#stringer-status').textContent = t('Courageous stories unavailable. You can still visit the Stringer collection below.');
    }
  } finally {
    loadDuration = performance.now() - loadStarted;
    for (const feed of Object.values(feedTimings)) {
      if (feed.state === 'loading') {
        feed.durationMs = performance.now() - feed.startedAt;
        feed.state = 'partial';
      }
    }
    clearInterval(loadTimer);
    loading = false;
    document.querySelectorAll('.story-list').forEach(list => list.setAttribute('aria-busy', 'false'));
    if (snapshot) render(); else renderStatuses();
  }
}
async function loadAtomstr() {
  if (loading) return;
  loading = true; lastAttempt = Date.now();
  loadStarted = performance.now();
  loadOutcome = '';
  loadStage = t('Loading news…');
  feedTimings = {};
  feedback.textContent = t('Loading news…');
  document.querySelectorAll('.story-list').forEach(list => list.setAttribute('aria-busy', 'true'));
  let redraw: ReturnType<typeof setTimeout> | undefined;
  try {
    const reader = await import('./atomstr-reader.js');
    if (!snapshot) {
      const sources = reader.cachedAtomstrSources(mirrorSources);
      for (const source of Object.values(sources)) source.status = 'loading';
      snapshot = { schemaVersion: 2, generatedAt: new Date().toISOString(), sources: {
        ...sources, stringer: {stories: [], status: 'loading', lastSuccessAt: null, attemptedAt: new Date().toISOString(), error: null},
      } };
      renderWorld();
      render();
    }
    const queueDraw = () => {
      if (!redraw) redraw = setTimeout(() => { redraw = undefined; renderWorld(); }, 150);
    };
    await Promise.allSettled([
      reader.readAtomstrSources({sources: mirrorSources, previous: snapshot.sources, onUpdate(id, entry) {
        snapshot!.sources[id] = entry; queueDraw();
      }}),
      (async () => {
        try {
          let original: Snapshot;
          if (relayConfig.enabled) {
            const relay = await import('./relay-reader.js');
            const cached = relay.cachedRelaySnapshot(relayConfig);
            if (cached) { snapshot!.sources.stringer = cached.sources.stringer!; render(); }
            original = await relay.readRelaySnapshot(relayConfig);
          } else {
            const response = await fetch(new URL('./data/news.json', import.meta.url), {cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000)});
            if (!response.ok) throw new Error('Unavailable collection');
            original = applyContentPermissions(validateSnapshot(JSON.parse(await readResponseText(response))));
          }
          snapshot!.sources.stringer = original.sources.stringer!;
        } catch {
          snapshot!.sources.stringer = {...snapshot!.sources.stringer!, status: 'failure'};
        }
        render();
      })(),
    ]);
    const completedSources = [...publisherSources.map(source => snapshot!.sources[source.id]!), snapshot.sources.stringer!];
    const successfulSources = completedSources.filter(source => source.status === 'success').length;
    loadOutcome = successfulSources === 0 ? 'Failed' : successfulSources === completedSources.length ? 'Loaded' : 'Partial';
    feedback.textContent = successfulSources === 0 ? t('The news collection is unavailable. We’ll retry automatically.') : '';
  } catch {
    loadOutcome = 'Failed';
    feedback.textContent = t('The news collection is unavailable. We’ll retry automatically.');
  } finally {
    clearTimeout(redraw);
    loadDuration = performance.now() - loadStarted;
    loadOutcome ||= 'Loaded';
    loading = false;
    if (snapshot) render(); else renderStatuses();
    document.querySelectorAll('.story-list').forEach(list => list.setAttribute('aria-busy', 'false'));
  }
}
const layoutObserver = new ResizeObserver(updateStoryVisibility);
layoutObserver.observe(requiredElement('#stringer-news'));
window.addEventListener('resize', updateStoryVisibility);
document.fonts.ready.then(updateStoryVisibility);
setInterval(() => { renderStatuses(); if (!document.hidden && Date.now() - lastAttempt >= interval) load(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastAttempt >= interval) load(); });
load();
