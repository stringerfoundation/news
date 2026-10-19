import { readResponseText } from './response.js';
import type { SourceState, Snapshot } from './relay/types.js';
import type { CommonsImage, ImageSession } from './relay/images.js';
import type { DisplayStory } from './news-model.js';
import type { FeedLoadTiming } from './relay/reader.js';
import { SOURCES, CONTENT_PERMISSIONS, applyContentPermissions, safeUrl, safeImageUrl, validateSnapshot, worldStories, formatLocalDateTime, formatPublicationDate } from './news-model.js';
import relayConfig from './relay-config.js';
import { STRINGER_MEDIA } from './stringer-media.js';
function requiredElement<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing reader element: ${selector}`);
  return node;
}
const menuToggle = requiredElement('.header-menu-toggle');
const headerMenu = requiredElement('#header-menu');
function setHeaderMenu(open: boolean) {
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
const feedback = requiredElement('#refresh-status');
const publisherSources = SOURCES.filter(source => source.id !== 'stringer');
const selectedSources = (): readonly string[] => publisherSources.map(source => source.id);
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
let ImageSessionClass: typeof ImageSession | null = null;
let searchCommons: typeof import('./relay/commons.js').searchCommons | null = null;
interface CommonsSearch { query: string; loading: boolean; results: CommonsImage[]; error: string; searched: boolean }
const commonsSearches = new Map<string, CommonsSearch>();
let imageSession: ImageSession | null = null;
let imageRefsKey = '';
let voter: string | null = null;
let accountNpub = '';
let accountNip05: string | null = null;
let identityPending = false;
let connectingSigner = false;
let accountRevision = 0;
let attemptedSigner: Window['nostr'];
let voteBusy = false;
let voteMessage = '';
const openImageReviews = new Set<string>();
const imageToolbar = element('div', '', 'image-toolbar');
imageToolbar.hidden = true;
requiredElement('#world-news').before(imageToolbar);
function syncImages() {
  const refs = snapshot?.imageCandidates || {};
  const storyIds = Object.entries(snapshot?.sources || {}).filter(([id]) => id !== 'stringer').flatMap(([, source]) => source.stories.flatMap(story => story.noteId ? [story.noteId] : []));
  const key = JSON.stringify([refs, storyIds]);
  if (key !== imageRefsKey && ImageSessionClass) {
    imageSession?.close();
    imageSession = null;
    imageRefsKey = key;
    if (storyIds.length) imageSession = new ImageSessionClass(relayConfig, refs, () => renderWorld(), storyIds);
  }
  renderNostrAccount();
}
function hasSigner() {
  return typeof window.nostr?.getPublicKey === 'function' && typeof window.nostr?.signEvent === 'function';
}
function refreshAccount() {
  if (snapshot) renderWorld(); else renderNostrAccount();
}
async function connectNostr() {
  if (!hasSigner() || connectingSigner) return;
  const signer = window.nostr!, revision = ++accountRevision;
  connectingSigner = true; voteMessage = ''; renderNostrAccount();
  try {
    const key = await signer.getPublicKey();
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('The signer returned an invalid account.');
    const identity = await import('./relay-reader.js');
    if (revision !== accountRevision || window.nostr !== signer) return;
    voter = key; accountNpub = identity.npubEncode(key); accountNip05 = null; identityPending = true;
    connectingSigner = false; refreshAccount();
    // The public Stringer root identifier is also checked when profile metadata
    // is missing. Every address must resolve back to the connected public key.
    const address = await identity.readIdentity(key, relayConfig.relays, key === relayConfig.pubkey ? '_@stringerjournalism.org' : undefined);
    if (revision !== accountRevision || voter !== key || window.nostr !== signer) return;
    accountNip05 = address; identityPending = false; refreshAccount();
  } catch (error) {
    if (revision !== accountRevision) return;
    if (voter) { identityPending = false; accountNip05 = null; }
    else voteMessage = error instanceof Error ? error.message : 'Could not connect to your signer.';
  } finally {
    if (revision === accountRevision) { connectingSigner = false; refreshAccount(); }
  }
}
function renderNostrAccount() {
  imageToolbar.replaceChildren();
  imageToolbar.hidden = !hasSigner();
  if (imageToolbar.hidden) return;
  if (voter) {
    const identity = element('div', '', 'nostr-identity');
    const npub = element('code', accountNpub); npub.className = 'account-npub';
    identity.append(npub, element('span', identityPending ? 'Looking up NIP-05…' : accountNip05 || 'NIP-05 unavailable', 'account-nip05'));
    imageToolbar.append(identity);
  }
  const connect = element('button', connectingSigner ? 'Connecting Nostr…' : voter ? 'Disconnect Nostr' : 'Connect Nostr');
  connect.type = 'button'; connect.disabled = voteBusy || connectingSigner;
  connect.addEventListener('click', () => {
    if (voter) {
      ++accountRevision; voter = null; accountNpub = ''; accountNip05 = null; identityPending = false; voteMessage = ''; refreshAccount();
    } else void connectNostr();
  });
  imageToolbar.append(connect);
  let status = voter && imageSession?.trustLive && !imageSession.canVote(voter)
    ? 'This account is not followed by Stringer and cannot approve images.' : voteMessage;
  if (!status && voter && imageSession) status = imageSession.canVote(voter) ? 'You can approve illustrative images.' : !imageSession.trustLive
    ? 'Waiting for Stringer’s follow list.' : 'This account is not followed by Stringer and cannot approve images.';
  const message = element('p', status); message.setAttribute('role', 'status'); imageToolbar.append(message);
}
function detectNostr() {
  if (!hasSigner()) {
    if (voter) { ++accountRevision; voter = null; accountNpub = ''; accountNip05 = null; identityPending = false; refreshAccount(); }
    else renderNostrAccount();
    return;
  }
  if (attemptedSigner === window.nostr) return;
  attemptedSigner = window.nostr;
  void connectNostr();
}
// Extensions can inject at document_end or shortly after the reader starts.
let signerChecks = 0;
const signerTimer = setInterval(() => {
  detectNostr();
  if (++signerChecks >= 40 || attemptedSigner) clearInterval(signerTimer);
}, 250);
window.addEventListener('load', detectNostr);
window.addEventListener('nostr:ready', detectNostr);
detectNostr();

function commonsCaption(candidate: CommonsImage) {
  const caption = element('figcaption');
  caption.append(document.createTextNode(`Illustrative image · ${candidate.creator} · ${candidate.attribution} · `));
  for (const [label, url] of [[candidate.title, candidate.filePage], [candidate.license, candidate.licenseUrl]] as const) {
    if (caption.lastChild?.nodeType === Node.ELEMENT_NODE) caption.append(document.createTextNode(' · '));
    const link = element('a', label); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; caption.append(link);
  }
  return caption;
}
function imageReview(storyId: string, title: string) {
  if (!hasSigner() || !voter || !imageSession?.canVote(voter)) return null;
  const selection = imageSession.selection(storyId);
  if (voter === relayConfig.pubkey && !commonsSearches.has(storyId))
    commonsSearches.set(storyId, { query: title, loading: false, results: [], error: '', searched: false });
  const details = element('details', '', 'image-review'); details.open = openImageReviews.has(storyId);
  details.append(element('summary', 'Review illustrative images'));
  details.addEventListener('toggle', () => {
    if (details.open) {
      openImageReviews.add(storyId);
      const state = commonsSearches.get(storyId);
      if (voter === relayConfig.pubkey && state && !state.searched && !state.loading) void findCommons(storyId, state.query);
    } else openImageReviews.delete(storyId);
  });
  const current = selection.latest.get(voter)?.vote.candidateId;
  for (const { candidate, count } of selection.scores) {
    const figure = element('figure');
    const img = element('img'); img.src = candidate.url; img.alt = candidate.alt;
    img.width = 120; img.height = 80; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    figure.append(img, commonsCaption(candidate));
    const selected = current === candidate.id;
    const button = element('button', selected ? 'Withdraw approval' : `Upvote image (${count})`);
    button.type = 'button'; button.disabled = voteBusy; button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', async () => {
      const session = imageSession, account = voter;
      voteBusy = true; voteMessage = 'Waiting for your signer and relay confirmation…'; renderWorld();
      try {
        if (!session || !account || !window.nostr) throw new Error('Reconnect your Nostr signer to approve images.');
        await session.vote(window.nostr, account, storyId, selected ? null : candidate.id);
        voteMessage = 'Vote published.';
      } catch (error) { voteMessage = error instanceof Error ? error.message : 'Could not publish your vote. Please retry.'; }
      finally { voteBusy = false; renderWorld(); }
    });
    figure.append(button); details.append(figure);
  }
  if (voter === relayConfig.pubkey) {
    const state = commonsSearches.get(storyId);
    const form = element('form', '', 'commons-search');
    const label = element('label', 'Search Commons for a person, place or subject');
    const input = element('input'); input.type = 'search'; input.value = state?.query || title; input.maxLength = 200; input.required = true;
    label.append(input);
    input.addEventListener('input', () => { if (state) state.query = input.value; });
    const submit = element('button', state?.loading ? 'Searching Commons…' : 'Search Commons'); submit.type = 'submit'; submit.disabled = !!state?.loading;
    form.addEventListener('submit', event => { event.preventDefault(); void findCommons(storyId, input.value); });
    form.append(label, submit); details.append(form);
    details.append(element('p', 'Choose a relevant illustration. Publishing and upvoting requests two signatures.'));
    if (state?.error) details.append(element('p', state.error, 'warning'));
    if (state?.searched && !state.loading && !state.error && !state.results.length)
      details.append(element('p', 'No reusable images found. Try a specific person, place or subject.'));
    for (const image of state?.results || []) {
      if (selection.scores.some(score => score.candidate.filePage === image.filePage)) continue;
      const figure = element('figure');
      const preview = element('img'); preview.src = image.url; preview.alt = image.alt; preview.width = 120; preview.height = 80; preview.loading = 'lazy'; preview.referrerPolicy = 'no-referrer';
      const publish = element('button', 'Publish and upvote image'); publish.type = 'button'; publish.disabled = voteBusy;
      publish.addEventListener('click', async () => {
        const session = imageSession, account = voter, signer = window.nostr;
        if (!session || !account || !signer) return;
        voteBusy = true; voteMessage = 'Approve two signer requests: the image candidate, then your vote.'; renderWorld();
        try {
          const id = await session.propose(signer, account, storyId, image);
          await session.vote(signer, account, storyId, id);
          voteMessage = 'Image and approval published.';
        } catch (error) { voteMessage = error instanceof Error ? error.message : 'Could not publish the image. Please retry.'; }
        finally { voteBusy = false; renderWorld(); }
      });
      figure.append(preview, commonsCaption(image), publish); details.append(figure);
    }
  } else if (!selection.scores.length) details.append(element('p', 'No candidate images have been published for this headline yet.'));
  return details;
}
async function findCommons(storyId: string, query: string) {
  if (!searchCommons || commonsSearches.get(storyId)?.loading) return;
  const state: CommonsSearch = commonsSearches.get(storyId) || { query, loading: false, results: [], error: '', searched: false };
  Object.assign(state, { query, loading: true, results: [], error: '', searched: false });
  commonsSearches.set(storyId, state); renderWorld();
  try { state.results = await searchCommons(query); }
  catch (error) { state.error = error instanceof Error ? error.message : 'Commons search is unavailable. Please retry.'; }
  finally { state.loading = false; state.searched = true; renderWorld(); }
}
window.addEventListener('pagehide', () => imageSession?.close());
window.addEventListener('pageshow', event => { if (event.persisted && snapshot) { imageRefsKey = ''; renderWorld(); } });
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
    const commons = wire && story.noteId ? imageSession?.selection(story.noteId).winner : null;
    const imageData = wire ? commons : story.image;
    const imageUrl = wire ? commons?.url : safeImageUrl(imageData?.url) || localImage;
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
        if (wire) { figure.remove(); article.classList.remove('with-image'); return; }
        const placeholder = element('div', '', 'story-placeholder');
        placeholder.setAttribute('aria-hidden', 'true');
        image.replaceWith(placeholder);
      });
      image.src = imageUrl;
      if (wire && commons) {
        figure.classList.add('wire-thumbnail');
        const imageLink = element('a');
        imageLink.href = commons.filePage; imageLink.target = '_blank'; imageLink.rel = 'noopener noreferrer';
        imageLink.setAttribute('aria-label', `View ${commons.title} on Wikimedia Commons`);
        imageLink.append(image);
        figure.append(imageLink);
      } else figure.append(image);
      if (commons) figure.append(commonsCaption(commons));
      if (!wire && story.image?.credit) figure.append(element('figcaption', story.image.credit));
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
      time.dateTime = publicationDate!; time.title = 'Publication date; source does not provide a confirmed time zone and time'; meta.append(time);
    } else if (story.credits) {
      meta.append(element('span', 'Publication date unavailable'));
    }
    if (meta.querySelector('time')) {
      const separator = element('span', '·'); separator.setAttribute('aria-hidden', 'true');
      meta.firstElementChild!.after(separator);
    }
    body.append(meta);
    if (wire && story.noteId) {
      const review = imageReview(story.noteId, story.title);
      if (review) body.append(review);
    }
    article.append(body); target.append(article);
  }
  if (!target.children.length && emptyMessage) target.append(element('p', emptyMessage, 'empty'));
}
const mobileLayout = matchMedia('(max-width: 767px)');
const sections = [
  { list: requiredElement('#world-news'), button: requiredElement('#world-more'), label: 'headlines', expanded: false },
  { list: requiredElement('#stringer-news'), button: requiredElement('#stringer-more'), label: 'courageous stories', expanded: false },
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
  const timing = loading ? `Loading · ${seconds} s elapsed` : `${loadOutcome} in ${seconds} s`;
  notes.push(loading ? `${loadStage} Total elapsed: ${seconds} s.` : `Latest feed load: ${timing.toLowerCase()}.`);
  if (Object.keys(feedTimings).length) {
    notes.push('Story retrieval from news relays:');
    for (const source of SOURCES) {
      const feed = feedTimings[source.id];
      if (!feed) continue;
      const elapsed = ((feed.durationMs ?? performance.now() - feed.startedAt) / 1000).toFixed(1);
      const state = feed.state;
      const description = state === 'empty' ? 'no published stories'
        : state === 'loaded' ? `loaded in ${elapsed} s`
        : state === 'loading' ? `loading · ${elapsed} s elapsed · ${feed.received}/${feed.total} stories`
        : `${feed.received}/${feed.total} stories received after ${elapsed} s`;
      notes.push(`${source.name} · ${description}`);
    }
  }
  if (snapshot) for (const group of ['world', 'stringer']) {
    const target = requiredElement(`#${group}-status`); target.replaceChildren();
    const sources = SOURCES.filter(s => group === 'stringer' ? s.id === 'stringer' : s.id !== 'stringer');
    for (const source of sources) {
      const entry = snapshot.sources[source.id]!;
      if (entry.status === 'paused') continue;
      const retained = retainedSources.get(source.id);
      if (retained) notes.push(`${source.name} · Showing ${retained.stories.length} previously collected stories${retained.lastSuccessAt ? ` from ${formatLocalDateTime(retained.lastSuccessAt)}` : ''}.`);
      if (relayConfig.enabled) {
        const counts = [];
        if ((entry.unavailable ?? 0) > 0 && !loading) counts.push(`${entry.unavailable} unavailable`);
        if ((entry.pending ?? 0) > 0) counts.push(`${entry.pending} queued`);
        if (counts.length) notes.push(`${source.name} · ${counts.join(' · ')}`);
      }
      if (entry.status === 'failure' && !(loading && entry.unavailable)) target.append(element('p', `${source.name}: refresh unavailable.${(retained?.stories.length || entry.stories.length) ? ' Showing previously collected stories.' : ' No stories available.'}`, 'warning'));
    }
  }
  for (const note of notes) relayDetails.append(element('p', note));
  relayStatus.hidden = notes.length === 0;
  const summary = relayStatus.querySelector('summary')!;
  summary.textContent = `Feed status · ${timing.toLowerCase()}`;
  summary.title = notes.join('\n');
}
function renderWorld() {
  if (!snapshot) return;
  const current = snapshot;
  syncImages();
  const selected = selectedSources();
  const worldPaused = selected.length > 0 && selected.every(id => current.sources[id]!.status === 'paused');
  const list = requiredElement('#world-news');
  renderStories(list, worldStories(displayedSnapshot(), selected), loading ? '' : worldPaused ? 'Global headlines are currently unavailable.' : 'No headlines available in this collection.');
  if (worldPaused) {
    const links = element('p', '', 'publisher-links');
    for (const { name, homepage, linkLabel } of publisherSources) {
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
  renderStories(requiredElement('#stringer-news'), shuffledStringerStories(displayedSnapshot().sources.stringer!.stories), loading ? '' : 'Courageous stories are currently unavailable. Visit the Stringer collection below.');
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
      ImageSessionClass = reader.ImageSession;
      searchCommons = reader.searchCommons;
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
      const response = await fetch('./data/news.json', { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(15000) });
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
    feedback.textContent = snapshot ? 'Could not check for updates. Keeping the previously loaded collection.' : 'The news collection is unavailable. We’ll retry automatically.';
    if (!snapshot) {
      requiredElement('#world-status').textContent = 'Headlines unavailable.';
      requiredElement('#stringer-status').textContent = 'Courageous stories unavailable. You can still visit the Stringer collection below.';
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
const layoutObserver = new ResizeObserver(updateStoryVisibility);
layoutObserver.observe(requiredElement('#stringer-news'));
window.addEventListener('resize', updateStoryVisibility);
document.fonts.ready.then(updateStoryVisibility);
setInterval(() => { renderStatuses(); if (!document.hidden && Date.now() - lastAttempt >= interval) load(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastAttempt >= interval) load(); });
load();
