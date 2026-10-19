import { localeForLanguage, translator } from './reader-locales.js';
import { PORTUGUESE_SOURCES } from './portuguese-sources.js';
import { SOURCES, CONTENT_PERMISSIONS, applyContentPermissions, safeUrl, safeImageUrl, validateSnapshot, worldGroups, formatLocalDateTime, formatPublicationDate } from './news-model.js';
import relayConfig from './relay-config.js';
import { STRINGER_MEDIA } from './stringer-media.js';
const locale = localeForLanguage(document.documentElement.lang);
const portugueseEdition = locale.startsWith('pt-');
const t = translator(locale);
// The existing homepage proxy only exposes the English reader's asset allowlist.
if (document.querySelector('base[href="/news-assets/"]')) document.querySelector('.edition-switcher').hidden = true;
const menuToggle = document.querySelector('.header-menu-toggle');
const headerMenu = document.querySelector('#header-menu');
function setHeaderMenu(open) {
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
const feedback = document.querySelector('#refresh-status');
const publisherSources = portugueseEdition ? PORTUGUESE_SOURCES : SOURCES.filter(source => source.id !== 'stringer');
const sourcePreferenceKey = portugueseEdition ? 'stringer-disabled-sources-pt-v1' : 'stringer-disabled-sources-v1';
let disabledSources = new Set();
try {
  const saved = portugueseEdition ? JSON.parse(localStorage.getItem(sourcePreferenceKey) || '[]') : [];
  if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
    disabledSources = new Set(saved.filter(id => publisherSources.some(source => source.id === id)));
  }
} catch { /* Preferences are optional when storage is unavailable. */ }
const selectedSources = () => publisherSources.filter(source => !disabledSources.has(source.id)).map(source => source.id);
const sourceOptions = document.querySelector('#source-options');
for (const source of portugueseEdition ? publisherSources : []) {
  const label = element('label');
  const checkbox = element('input');
  checkbox.type = 'checkbox'; checkbox.value = source.id;
  checkbox.checked = !disabledSources.has(source.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) disabledSources.delete(source.id); else disabledSources.add(source.id);
    updateSourcePreferences();
  });
  label.append(checkbox, document.createTextNode(source.name)); sourceOptions.append(label);
}
function enableAllSources() { disabledSources.clear(); updateSourcePreferences(); }
document.querySelector('#enable-all-sources')?.addEventListener('click', enableAllSources);
function updateSourcePreferences() {
  try { localStorage.setItem(sourcePreferenceKey, JSON.stringify([...disabledSources])); } catch { /* In-memory choices still work. */ }
  updateSourceControls();
  if (snapshot) renderWorld();
}
function updateSourceControls() {
  if (!portugueseEdition) return;
  document.querySelector('#source-count').textContent = t('{enabled} of {total} enabled', {enabled: selectedSources().length, total: publisherSources.length});
  for (const checkbox of sourceOptions.querySelectorAll('input')) checkbox.checked = !disabledSources.has(checkbox.value);
  document.querySelector('#enable-all-sources').disabled = disabledSources.size === 0;
}
updateSourceControls();
const sourceSearch = document.querySelector('#source-search');
if (sourceSearch) {
sourceSearch.hidden = publisherSources.length <= 12;
sourceSearch.setAttribute('aria-label', t('Search sources'));
sourceSearch.placeholder = t('Search sources');
sourceSearch.addEventListener('input', () => {
  const query = sourceSearch.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const label of sourceOptions.children) {
    label.hidden = !label.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query);
  }
  document.querySelector('#no-matching-sources').hidden = [...sourceOptions.children].some(label => !label.hidden);
});
}
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
    const localImage = CONTENT_PERMISSIONS.stringer.images && approvedMedia?.image ? (portugueseEdition ? new URL(approvedMedia.image, import.meta.url).href : approvedMedia.image) : null;
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
      image.width = wire ? 120 : 240; image.height = wire ? 80 : 240;
      image.loading = index === 0 ? 'eager' : 'lazy';
      image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
      let triedLocal = imageUrl === localImage;
      image.addEventListener('error', () => {
        if (localImage && !triedLocal) {
          triedLocal = true;
          image.src = localImage;
          return;
        }
        figure.remove(); article.classList.remove('with-image');
        if (usePlaceholder) showPlaceholder();
        balanceNewswire();
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
    const grouped = wire && story.articles?.length > 1;
    if (wire && story.mayRequireSubscription) body.append(element('p', t('May require subscription'), 'subscription-warning'));
    meta.append(element('span', grouped ? `${t('{count} articles', {count: story.articles.length})} · ${[...new Set(story.articles.map(a => a.source))].join(', ')}` : story.source || new URL(url).hostname.replace(/^www\./, ''), 'source'));
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
      time.dateTime = publicationDate; time.title = t('Publication date; source does not provide a confirmed time zone and time'); meta.append(time);
    } else if (story.credits) {
      meta.append(element('span', t('Publication date unavailable')));
    }
    if (meta.querySelector('time')) {
      const separator = element('span', '·'); separator.setAttribute('aria-hidden', 'true');
      meta.firstElementChild.after(separator);
    }
    body.append(meta);
    if (grouped) {
      const details = element('details', '', 'group-articles');
      details.append(element('summary', t('View {count} articles', {count: story.articles.length})));
      const list = element('ul');
      for (const member of story.articles) {
        const memberUrl = safeUrl(member.url); if (!memberUrl) continue;
        const item = element('li');
        item.append(element('span', `${member.source} · `, 'source'));
        const memberLink = element('a', member.title);
        memberLink.href = memberUrl; memberLink.target = '_blank'; memberLink.rel = 'noopener noreferrer';
        item.append(memberLink);
        if (member.mayRequireSubscription) item.append(element('span', t('May require subscription'), 'subscription-warning'));
        list.append(item);
      }
      details.append(list);
      details.addEventListener('toggle', balanceNewswire);
      body.append(details);
    }
    article.append(body); target.append(article);
  }
  if (!target.children.length && emptyMessage) target.append(element('p', emptyMessage, 'empty'));
}
let balancing = false;
function arrangeMobileHeadlines(mobile) {
  const list = document.querySelector('#world-news');
  const more = document.querySelector('#world-more');
  const remainder = document.querySelector('#world-more-list');
  const cards = [...list.children, ...remainder.children].filter(node => node.tagName === 'ARTICLE');
  const limit = innerHeight < 640 ? 2 : innerHeight < 740 ? 3 : 4;
  cards.forEach((card, index) => {
    const destination = mobile && index >= limit ? remainder : list;
    if (card.parentElement !== destination) destination.append(card);
  });
  more.hidden = !mobile || remainder.children.length === 0;
  const label = more.open ? t('Show fewer headlines') : t('More headlines ({count})', {count: remainder.children.length});
  if (more.querySelector('summary').textContent !== label) more.querySelector('summary').textContent = label;
  return cards;
}
function balanceNewswire() {
  if (balancing || !snapshot) return;
  balancing = true;
  try {
    const stringer = document.querySelector('#stringer-news');
    const mobile = matchMedia('(max-width: 767px)').matches;
    const cards = arrangeMobileHeadlines(mobile);
    // Show real headlines until their content reaches the end of the Stringer collection.
    // Images reserve their space, so loading them does not keep shifting the balance.
    cards.forEach(card => { card.hidden = false; });
    if (!mobile && stringer.querySelector('article')) {
      const bottom = stringer.getBoundingClientRect().bottom;
      const last = cards.findIndex(card => card.getBoundingClientRect().bottom >= bottom);
      if (last !== -1) cards.slice(last + 1).forEach(card => { card.hidden = true; });
    }
  } finally { balancing = false; }
}
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
    const sources = group === 'stringer' ? SOURCES.filter(s => s.id === 'stringer') : publisherSources.filter(s => !disabledSources.has(s.id));
    for (const source of sources) {
      const entry = snapshot.sources[source.id];
      if (entry.status === 'paused' || entry.status === 'loading') continue;
      if (relayConfig.enabled) {
        const counts = [];
        if (entry.unavailable > 0 && !loading) counts.push(t('{count} unavailable', {count: entry.unavailable}));
        if (entry.pending > 0) counts.push(t('{count} queued', {count: entry.pending}));
        if (counts.length) notes.push(`${source.name} · ${counts.join(' · ')}`);
      }
      if (entry.status === 'failure' && !(loading && entry.unavailable)) target.append(element('p', t('{source}: refresh unavailable.{retained}', {source: source.name, retained: t(entry.stories.length ? ' Showing previously collected stories.' : ' No stories available.')}), 'warning'));
    }
  }
  if (portugueseEdition) {
    const target = document.querySelector('#world-status');
    const warnings = [...target.children];
    if (warnings.length) {
      const details = element('details');
      details.append(element('summary', t('Unavailable sources ({count})', {count: warnings.length})), ...warnings);
      target.replaceChildren(details);
    }
  }
  for (const note of notes) relayDetails.append(element('p', note));
  relayStatus.hidden = notes.length === 0;
  const summary = relayStatus.querySelector('summary');
  summary.textContent = timing ? `Feed status · ${timing.toLowerCase()}` : 'Feed status';
  summary.title = notes.join('\n');
}
function renderWorld() {
  document.querySelector('#world-more-list').replaceChildren();
  const selected = selectedSources();
  const worldPaused = selected.length > 0 && selected.every(id => snapshot.sources[id].status === 'paused');
  const list = document.querySelector('#world-news');
  const stories = worldGroups(snapshot, selected, publisherSources);
  renderStories(list, portugueseEdition ? stories.slice(0, 300) : stories, !selected.length ? t('No sources selected.') : loading ? '' : worldPaused ? t('Global headlines are currently unavailable.') : t('No headlines available in this collection.'));
  if (!selected.length) {
    const button = element('button', t('Enable all'), 'enable-all-empty');
    button.type = 'button'; button.addEventListener('click', enableAllSources); list.append(button);
  }
  if (worldPaused && !portugueseEdition) {
    const links = element('p', '', 'publisher-links');
    for (const [id, name, url] of [
      ['bbc', 'BBC News', 'https://www.bbc.com/news'],
      ['nyt', 'The New York Times', 'https://www.nytimes.com/section/world'],
      ['aljazeera', 'Al Jazeera', 'https://www.aljazeera.com/'],
      ['dw', 'DW', 'https://www.dw.com/'],
      ['cna', 'CNA', 'https://www.channelnewsasia.com/world'],
    ]) {
      if (!selected.includes(id)) continue;
      const link = element('a', name); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      if (links.childNodes.length) links.append(document.createTextNode(' · '));
      links.append(link);
    }
    list.append(links);
  }
  renderStatuses();
  balanceNewswire();
}
function render() {
  renderStories(document.querySelector('#stringer-news'), shuffledStringerStories(snapshot.sources.stringer.stories), loading ? '' : t('Courageous stories are currently unavailable. Visit the Stringer collection below.'));
  renderWorld();
}
async function load() {
  if (portugueseEdition) return loadPortuguese();
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
      const response = await fetch(new URL('./data/news.json', import.meta.url), { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000) });
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
    feedback.textContent = t(snapshot ? 'Could not check for updates. Keeping the previously loaded collection.' : 'The news collection is unavailable. We’ll retry automatically.');
    if (!snapshot) {
      document.querySelector('#world-status').textContent = t('Headlines unavailable.');
      document.querySelector('#stringer-status').textContent = t('Courageous stories unavailable. You can still visit the Stringer collection below.');
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

async function loadPortuguese() {
  if (loading) return;
  loading = true; lastAttempt = Date.now();
  loadStarted = performance.now();
  loadOutcome = '';
  loadStage = t('Loading news…');
  feedTimings = {};
  feedback.textContent = t('Loading news…');
  document.querySelectorAll('.story-list').forEach(list => list.setAttribute('aria-busy', 'true'));
  let redraw;
  try {
    const reader = await import('./portuguese-reader.js');
    if (!snapshot) {
      const sources = reader.cachedPortugueseSources(publisherSources);
      for (const source of Object.values(sources)) source.status = 'loading';
      snapshot = { generatedAt: new Date().toISOString(), sources: {
        ...sources, stringer: {stories: [], status: 'loading', lastSuccessAt: null},
      } };
      renderWorld();
    }
    const queueDraw = () => {
      if (!redraw) redraw = setTimeout(() => { redraw = null; renderWorld(); }, 150);
    };
    await Promise.allSettled([
      reader.readPortugueseSources({sources: publisherSources, previous: snapshot.sources, onUpdate(id, entry) {
        snapshot.sources[id] = entry; queueDraw();
      }}),
      (async () => {
        try {
          let original;
          if (relayConfig.enabled) {
            const relay = await import('./relay-reader.js');
            const cached = relay.cachedRelaySnapshot(relayConfig);
            if (cached) { snapshot.sources.stringer = cached.sources.stringer; render(); }
            original = await relay.readRelaySnapshot(relayConfig);
          } else {
            const response = await fetch(new URL('./data/news.json', import.meta.url), {cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000)});
            if (!response.ok) throw new Error('Unavailable collection');
            original = applyContentPermissions(validateSnapshot(await response.json()));
          }
          snapshot.sources.stringer = original.sources.stringer;
        } catch {
          snapshot.sources.stringer = {...snapshot.sources.stringer, status: 'failure'};
        }
        render();
      })(),
    ]);
    feedback.textContent = '';
  } catch {
    loadOutcome = 'Failed';
    feedback.textContent = t('The news collection is unavailable. We’ll retry automatically.');
  } finally {
    clearTimeout(redraw);
    loadDuration = performance.now() - loadStarted;
    loadOutcome ||= 'Loaded';
    loading = false;
    if (snapshot) renderWorld();
    document.querySelectorAll('.story-list').forEach(list => list.setAttribute('aria-busy', 'false'));
  }
}

const layoutObserver = new ResizeObserver(balanceNewswire);
layoutObserver.observe(document.querySelector('#stringer-news'));
window.addEventListener('resize', balanceNewswire);
document.querySelector('#world-more').addEventListener('toggle', balanceNewswire);
document.fonts?.ready.then(balanceNewswire);
setInterval(() => { renderStatuses(); balanceNewswire(); if (!document.hidden && Date.now() - lastAttempt >= interval) load(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastAttempt >= interval) load(); });
load();
