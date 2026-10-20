import { SOURCES, CONTENT_PERMISSIONS, applyContentPermissions, safeUrl, safeImageUrl, validateSnapshot, worldStories, formatLocalDateTime, formatPublicationDate } from './news-model.js';
import relayConfig from './relay-config.js';
import { STRINGER_MEDIA } from './stringer-media.js';
const menuToggle = document.querySelector('.header-menu-toggle');
const headerMenu = document.querySelector('#header-menu');
function setHeaderMenu(open) {
  headerMenu.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuToggle.addEventListener('click', () => setHeaderMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    setHeaderMenu(false); menuToggle.focus();
  }
});
matchMedia('(max-width: 920px)').addEventListener('change', () => setHeaderMenu(false));
const feedback = document.querySelector('#refresh-status');
const publisherSources = SOURCES.filter(source => source.id !== 'stringer');
const selectedSources = () => publisherSources.map(source => source.id);
const interval = 5 * 60 * 1000;
let snapshot = null;
let loading = false;
let lastAttempt = 0;
let loadStarted = null;
let loadDuration = 0;
let loadOutcome = '';
let loadStage = '';
let feedTimings = {};
// Per-page random ranks keep the complete collection stable during polling.
const stringerOrder = new Map();
function shuffledStringerStories(stories) {
  for (const story of stories) {
    if (!stringerOrder.has(story.url)) stringerOrder.set(story.url, Math.random());
  }
  return [...stories].sort((a, b) => stringerOrder.get(a.url) - stringerOrder.get(b.url));
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function renderStories(target, stories, emptyMessage) {
  target.replaceChildren();
  const usePlaceholder = target.id === 'stringer-news';
  const wire = target.id === 'world-news';
  for (const [index, story] of stories.entries()) {
    const url = safeUrl(story.url); if (!url) continue;
    const approvedMedia = usePlaceholder ? STRINGER_MEDIA.get(url) : null;
    const localImage = CONTENT_PERMISSIONS.stringer.images ? approvedMedia?.image : null;
    const article = element('article', '', 'story');
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
      figure.append(image);
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
    const publishedAt = story.publishedAt || approvedMedia?.publishedAt;
    if (publishedAt) {
      const time = element('time', formatLocalDateTime(publishedAt));
      time.title = `Local time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
      time.dateTime = publishedAt; meta.append(time);
    } else if (story.publicationDate || approvedMedia?.publicationDate) {
      const publicationDate = story.publicationDate || approvedMedia?.publicationDate;
      const time = element('time', formatPublicationDate(publicationDate));
      time.dateTime = publicationDate; time.title = 'Publication date; source does not provide a confirmed time zone and time'; meta.append(time);
    } else if (story.credits) {
      meta.append(element('span', 'Publication date unavailable'));
    }
    if (meta.querySelector('time')) {
      const separator = element('span', '·'); separator.setAttribute('aria-hidden', 'true');
      meta.firstElementChild.after(separator);
    }
    body.append(meta);
    article.append(body); target.append(article);
  }
  if (!target.children.length && emptyMessage) target.append(element('p', emptyMessage, 'empty'));
}
const mobileLayout = matchMedia('(max-width: 767px)');
const sections = [
  { list: document.querySelector('#world-news'), button: document.querySelector('#world-more'), label: 'headlines', expanded: false },
  { list: document.querySelector('#stringer-news'), button: document.querySelector('#stringer-more'), label: 'courageous stories', expanded: false },
];
function updateStoryVisibility() {
  for (const section of sections) {
    const cards = [...section.list.querySelectorAll('article')];
    cards.forEach((card, index) => { card.hidden = mobileLayout.matches && !section.expanded && index >= 5; });
    section.button.hidden = !mobileLayout.matches || cards.length <= 5;
    section.button.setAttribute('aria-expanded', String(section.expanded));
    section.button.textContent = `Show ${section.expanded ? 'fewer' : 'more'} ${section.label}`;
    section.button.setAttribute('aria-label', section.button.textContent);
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
  const relayStatus = document.querySelector('#relay-status');
  const relayDetails = document.querySelector('#relay-status-details');
  relayDetails.replaceChildren();
  const notes = [];
  const seconds = ((loading ? performance.now() - loadStarted : loadDuration) / 1000).toFixed(1);
  const timing = loading ? `Loading · ${seconds} s elapsed` : loadOutcome ? `${loadOutcome} in ${seconds} s` : '';
  if (timing) notes.push(loading ? `${loadStage} Total elapsed: ${seconds} s.` : `Latest feed load: ${timing.toLowerCase()}.`);
  if (Object.keys(feedTimings).length) {
    notes.push('Story retrieval from news relays:');
    for (const source of SOURCES) {
      const feed = feedTimings[source.id];
      if (!feed) continue;
      const elapsed = ((feed.durationMs ?? performance.now() - feed.startedAt) / 1000).toFixed(1);
      const state = feed.state === 'loading' && !loading ? 'partial' : feed.state;
      const description = state === 'empty' ? 'no published stories'
        : state === 'loaded' ? `loaded in ${elapsed} s`
        : state === 'loading' ? `loading · ${elapsed} s elapsed · ${feed.received}/${feed.total} stories`
        : `${feed.received}/${feed.total} stories received after ${elapsed} s`;
      notes.push(`${source.name} · ${description}`);
    }
  }
  if (snapshot) for (const group of ['world', 'stringer']) {
    const target = document.querySelector(`#${group}-status`); target.replaceChildren();
    const sources = SOURCES.filter(s => group === 'stringer' ? s.id === 'stringer' : s.id !== 'stringer');
    for (const source of sources) {
      const entry = snapshot.sources[source.id];
      if (entry.status === 'paused') continue;
      if (relayConfig.enabled) {
        const counts = [];
        if (entry.unavailable > 0 && !loading) counts.push(`${entry.unavailable} unavailable`);
        if (entry.pending > 0) counts.push(`${entry.pending} queued`);
        if (counts.length) notes.push(`${source.name} · ${counts.join(' · ')}`);
      }
      if (entry.status === 'failure' && !(loading && entry.unavailable)) target.append(element('p', `${source.name}: refresh unavailable.${entry.stories.length ? ' Showing previously collected stories.' : ' No stories available.'}`, 'warning'));
    }
  }
  for (const note of notes) relayDetails.append(element('p', note));
  relayStatus.hidden = notes.length === 0;
  const summary = relayStatus.querySelector('summary');
  summary.textContent = timing ? `Feed status · ${timing.toLowerCase()}` : 'Feed status';
  summary.title = notes.join('\n');
}
function renderWorld() {
  const selected = selectedSources();
  const worldPaused = selected.length > 0 && selected.every(id => snapshot.sources[id].status === 'paused');
  const list = document.querySelector('#world-news');
  renderStories(list, worldStories(snapshot, selected), loading ? '' : worldPaused ? 'Global headlines are currently unavailable.' : 'No headlines available in this collection.');
  if (worldPaused) {
    const links = element('p', '', 'publisher-links');
    for (const [name, url] of [
      ['BBC News', 'https://www.bbc.com/news'],
      ['The New York Times', 'https://www.nytimes.com/section/world'],
      ['Al Jazeera', 'https://www.aljazeera.com/'],
      ['DW', 'https://www.dw.com/'],
      ['CNA', 'https://www.channelnewsasia.com/world'],
    ]) {
      const link = element('a', name); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      if (links.childNodes.length) links.append(document.createTextNode(' · '));
      links.append(link);
    }
    list.append(links);
  }
  renderStatuses();
  updateStoryVisibility();
}
function render() {
  renderStories(document.querySelector('#stringer-news'), shuffledStringerStories(snapshot.sources.stringer.stories), loading ? '' : 'Courageous stories are currently unavailable. Visit the Stringer collection below.');
  renderWorld();
}
async function load() {
  if (loading) return;
  loading = true; lastAttempt = Date.now();
  loadStarted = performance.now();
  loadStage = snapshot ? 'Checking for updates…' : 'Loading news…';
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
        loadStage = message;
        renderStatuses();
        console.info('[Stringer reader]', message);
      }, partial => {
        if (snapshot && Date.parse(partial.generatedAt) < Date.parse(snapshot.generatedAt)) return;
        // Preserve already displayed stories while the rest of the update arrives.
        for (const source of SOURCES) {
          const old = snapshot?.sources[source.id];
          const nextSource = partial.sources[source.id];
          if (old && (old.stories.length > nextSource.stories.length || !nextSource.stories.length))
            partial.sources[source.id] = old;
        }
        snapshot = partial;
        render();
      }, timings => {
        feedTimings = timings;
        renderStatuses();
      });
    } else {
      const response = await fetch('./data/news.json', { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      next = applyContentPermissions(validateSnapshot(await response.json()));
    }
    if (snapshot && Date.parse(next.generatedAt) < Date.parse(snapshot.generatedAt)) throw new Error('Older snapshot returned');
    snapshot = next; render();
    loadOutcome = 'Loaded';
    feedback.textContent = '';
  } catch (error) {
    loadOutcome = 'Failed';
    console.error('[Stringer reader] Collection refresh failed:', error);
    feedback.textContent = snapshot ? 'Could not check for updates. Keeping the previously loaded collection.' : 'The news collection is unavailable. We’ll retry automatically.';
    if (!snapshot) {
      document.querySelector('#world-status').textContent = 'Headlines unavailable.';
      document.querySelector('#stringer-status').textContent = 'Courageous stories unavailable. You can still visit the Stringer collection below.';
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
setInterval(() => { renderStatuses(); if (!document.hidden && Date.now() - lastAttempt >= interval) load(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastAttempt >= interval) load(); });
load();
