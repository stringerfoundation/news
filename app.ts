import { readResponseText } from './response.js';
import type { SourceState, Snapshot } from './relay/types.js';
import type { CommonsImage, ImageSession } from './relay/images.js';
import type { ImageSource } from './relay/open-images.js';
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
let ImageSessionClass: typeof ImageSession | null = null;
let searchImages: typeof import('./relay/open-images.js').searchImages | null = null;
let commonsSubject: typeof import('./relay/commons.js').commonsSubject;
interface CommonsSearch { query: string; source: ImageSource; issues: string[]; loading: boolean; results: CommonsImage[]; error: string; searched: boolean }
const commonsSearches = new Map<string, CommonsSearch>();
const suggestionQueue = new Set<string>();
let activeSuggestions = 0;
const suggestionObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    suggestionObserver.unobserve(entry.target);
    const id = (entry.target as HTMLElement).dataset.storyId;
    if (id) suggestionQueue.add(id);
  }
  loadSuggestions();
}, { rootMargin: '100px' });
function loadSuggestions() {
  if (!imageSession) { suggestionQueue.clear(); return; }
  for (const id of suggestionQueue) {
    if (activeSuggestions >= 2) break;
    suggestionQueue.delete(id);
    const state = commonsSearches.get(id);
    if (!state || state.loading || state.searched || !imageSession.refs[id]) continue;
    activeSuggestions++;
    void findCommons(id, state.query, true).finally(() => { activeSuggestions--; loadSuggestions(); });
  }
}
let imageSession: ImageSession | null = null;
let imageRefsKey = '';
let voter: string | null = null;
let accountNpub = '';
let accountNip05: string | null = null;
let identityPending = false;
let connectingSigner = false;
let accountRevision = 0;
let connectedSigner: Window['nostr'];
let voteBusy = false;
let voteMessage = '';
const openImageReviews = new Set<string>();
interface ImageAction { kind: 'skip' | 'vote' | 'choose'; chosen: CommonsImage | null; skipped: string[]; candidateId: string | null }
const chosenImages = new Map<string, CommonsImage>();
const skippedImages = new Map<string, string[]>();
const imageHistory = new Map<string, ImageAction[]>();
const choiceKey = (storyId: string, account = voter) => `${account}:${storyId}`;
function rememberImageAction(storyId: string, kind: ImageAction['kind'], candidateId: string | null, account = voter) {
  const key = choiceKey(storyId, account), history = imageHistory.get(key) || [];
  history.push({ kind, candidateId, chosen: chosenImages.get(key) || null, skipped: [...(skippedImages.get(key) || [])] });
  imageHistory.set(key, history.slice(-100));
}
function imageOptions(storyId: string) {
  const selection = imageSession?.selection(storyId);
  const chosen = chosenImages.get(choiceKey(storyId));
  const images = [...(chosen ? [selection?.scores.find(score => score.candidate.filePage === chosen.filePage)?.candidate || chosen] : []), ...(selection?.winner ? [selection.winner] : []), ...(selection?.scores.map(score => score.candidate) || []), ...(commonsSearches.get(storyId)?.results || [])];
  return images.filter((image, index) => images.findIndex(other => other.filePage === image.filePage) === index);
}
function skipImage(storyId: string, image: CommonsImage) {
  if (!voter || !imageSession?.canVote(voter) || voteBusy) return;
  rememberImageAction(storyId, 'skip', null);
  const key = choiceKey(storyId);
  skippedImages.set(key, [...(skippedImages.get(key) || []), image.filePage]);
  renderWorld();
}
async function undoImage(storyId: string) {
  const key = choiceKey(storyId), history = imageHistory.get(key), action = history?.at(-1);
  if (!action || voteBusy) return;
  if (action.kind === 'vote' && !await castImageVote(storyId, action.candidateId, false)) return;
  if (action.chosen) chosenImages.set(key, action.chosen); else chosenImages.delete(key);
  skippedImages.set(key, [...action.skipped]); history!.pop(); renderWorld();
}
async function castImageVote(storyId: string, candidateId: string | null, remember = true) {
  const session = imageSession, account = voter, signer = window.nostr;
  if (!session || !account || !signer || voteBusy) return false;
  const prior = session.selection(storyId).latest.get(account)?.vote.candidateId || null;
  voteBusy = true; voteMessage = 'Waiting for your signer and relay confirmation…'; renderWorld();
  let published = false;
  try {
    const previousTime = session.selection(storyId).latest.get(account)?.event.created_at;
    const delay = previousTime ? (previousTime + 1) * 1000 - Date.now() : 0;
    if (delay > 0 && delay < 2000) await new Promise(resolve => setTimeout(resolve, delay));
    await session.vote(signer, account, storyId, candidateId);
    if (remember) rememberImageAction(storyId, 'vote', prior, account);
    const image = candidateId ? session.candidates.get(candidateId) : null;
    if (image) skippedImages.set(choiceKey(storyId, account), (skippedImages.get(choiceKey(storyId, account)) || []).filter(page => page !== image.filePage));
    voteMessage = remember ? 'Vote published.' : 'Previous approval restored.';
    published = true;
  } catch (error) { voteMessage = error instanceof Error ? error.message : 'Could not publish your vote. Please retry.'; }
  finally { voteBusy = false; renderWorld(); }
  return published;
}
const imageToolbar = element('div', '', 'image-toolbar');
imageToolbar.hidden = true;
requiredElement('.footer-notes').append(imageToolbar);
function syncImages() {
  const refs = snapshot?.imageCandidates || {};
  const storyIds = Object.entries(snapshot?.sources || {}).filter(([id]) => id !== 'stringer').flatMap(([, source]) => source.stories.flatMap(story => story.noteId ? [story.noteId] : []));
  const key = JSON.stringify([refs, storyIds]);
  if (key !== imageRefsKey && ImageSessionClass && (!loading || !imageSession)) {
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
  connectedSigner = signer;
  connectingSigner = true; voteMessage = ''; renderNostrAccount();
  try {
    let timer: ReturnType<typeof setTimeout>;
    const key = await Promise.race([
      signer.getPublicKey(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Nostr connection timed out. Check your extension’s permission prompt, then click Connect Nostr to retry.')), 10000); }),
    ]).finally(() => clearTimeout(timer));
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
  const buttonFocused = imageToolbar.contains(document.activeElement);
  imageToolbar.replaceChildren();
  imageToolbar.hidden = !hasSigner();
  if (imageToolbar.hidden) return;
  if (voter) {
    const identity = element('div', '', 'nostr-identity');
    const npub = element('code', accountNpub); npub.className = 'account-npub';
    identity.append(npub, element('span', identityPending ? 'Looking up NIP-05…' : accountNip05 || 'NIP-05 unavailable', 'account-nip05'));
    imageToolbar.append(identity);
  }
  const connect = element('button', connectingSigner ? 'Cancel Nostr connection' : voter ? 'Disconnect Nostr' : 'Connect Nostr');
  connect.type = 'button'; connect.disabled = voteBusy;
  connect.addEventListener('click', () => {
    if (voter || connectingSigner) disconnectNostr();
    else void connectNostr();
  });
  imageToolbar.append(connect);
  if (buttonFocused) connect.focus({ preventScroll: true });
  let status = voter && imageSession?.trustLive && !imageSession.canVote(voter)
    ? 'This account is not followed by Stringer and cannot approve images.' : voteMessage;
  if (!status && voter && imageSession) status = imageSession.canVote(voter) ? 'You can approve illustrative images.' : 'Waiting for Stringer’s follow list.';
  const message = element('p', status); message.setAttribute('role', 'status'); imageToolbar.append(message);
}
function disconnectNostr() {
  ++accountRevision;
  connectedSigner = undefined;
  connectingSigner = false;
  voter = null;
  accountNpub = '';
  accountNip05 = null;
  identityPending = false;
  voteMessage = '';
  refreshAccount();
}
function detectNostr() {
  if ((voter || connectingSigner) && (!hasSigner() || connectedSigner !== window.nostr)) disconnectNostr();
  else renderNostrAccount();
}
// Extensions can inject at document_end or shortly after the reader starts.
let signerChecks = 0;
const signerTimer = setInterval(() => {
  detectNostr();
  if (++signerChecks >= 40 || hasSigner()) clearInterval(signerTimer);
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
  if (candidate.sourceName) caption.append(document.createTextNode(` · ${candidate.sourceName}`));
  return caption;
}
const creditDialog = element('dialog', '', 'image-credit-dialog');
creditDialog.setAttribute('aria-label', 'Image credits');
const closeCredit = element('button', 'Close');
closeCredit.type = 'button';
closeCredit.autofocus = true;
closeCredit.addEventListener('click', () => creditDialog.close());
document.body.append(creditDialog);
function thumbnailCredit(candidate: CommonsImage, suggested: boolean) {
  const caption = element('figcaption');
  const credit = element('button', 'Image credits');
  credit.type = 'button';
  credit.setAttribute('aria-haspopup', 'dialog');
  if (suggested) credit.setAttribute('aria-description', 'Automatically suggested image');
  credit.addEventListener('click', () => {
    const figure = element('figure');
    figure.append(commonsCaption(candidate));
    creditDialog.replaceChildren(figure, closeCredit);
    creditDialog.showModal();
  });
  caption.append(credit);
  return caption;
}
function prepareImageSearch(storyId: string, title: string) {
  if (!commonsSearches.has(storyId)) {
    commonsSearches.set(storyId, { query: commonsSubject(title), source: 'all', issues: [], loading: false, results: [], error: '', searched: false });
  }
}
function imageReview(storyId: string, title: string) {
  if (!hasSigner() || !voter || !imageSession?.canVote(voter)) return null;
  const selection = imageSession.selection(storyId);
  prepareImageSearch(storyId, title);
  const control = element('div', '', 'image-review-control'); control.dataset.storyId = storyId;
  const details = element('dialog', '', 'image-review');
  details.id = `image-review-${storyId}`;
  details.setAttribute('aria-label', `Image choices for ${title}`);
  const open = element('button', '⋯'); open.type = 'button'; open.title = 'Review illustrative images';
  open.setAttribute('aria-label', 'Review illustrative images');
  open.dataset.imageAction = `${storyId}:review`;
  const closeReview = () => { openImageReviews.delete(storyId); details.close(); open.focus(); };
  open.addEventListener('click', () => {
    const visible = imageOptions(storyId).find(image => !skippedImages.get(choiceKey(storyId))?.includes(image.filePage));
    if (visible) chosenImages.set(choiceKey(storyId), visible);
    openImageReviews.add(storyId); details.showModal();
    const state = commonsSearches.get(storyId);
    if (state && !state.loading) void findCommons(storyId, state.query);
  });
  const close = element('button', 'Close image review'); close.type = 'button';
  close.addEventListener('click', closeReview);
  details.addEventListener('cancel', () => { openImageReviews.delete(storyId); });
  details.append(close, element('h3', title), element('p', 'Click an image to choose it. Approve it afterwards to share it with other readers.'));
  queueMicrotask(() => { if (details.isConnected && openImageReviews.has(storyId)) details.showModal(); });
  const grid = element('div', '', 'image-choice-grid');
  const choose = (image: CommonsImage) => {
    rememberImageAction(storyId, 'choose', null);
    chosenImages.set(choiceKey(storyId), image);
    skippedImages.set(choiceKey(storyId), (skippedImages.get(choiceKey(storyId)) || []).filter(page => page !== image.filePage));
    closeReview(); renderWorld();
    queueMicrotask(() => document.querySelector<HTMLButtonElement>(`[data-image-action="${storyId}:up"]`)?.focus());
  };
  const choiceButton = (image: CommonsImage, img: HTMLImageElement) => {
    const button = element('button', '', 'image-choice'); button.type = 'button';
    button.setAttribute('aria-label', `Choose image: ${image.title}`);
    button.dataset.imageAction = `${storyId}:choose:${image.filePage}`;
    button.setAttribute('aria-pressed', String(chosenImages.get(choiceKey(storyId))?.filePage === image.filePage));
    button.append(img); button.addEventListener('click', () => choose(image));
    return button;
  };
  const current = selection.latest.get(voter)?.vote.candidateId;
  for (const { candidate, count } of selection.scores) {
    const figure = element('figure');
    const img = element('img'); img.src = candidate.url; img.alt = candidate.alt;
    img.width = 120; img.height = 80; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    figure.append(choiceButton(candidate, img), commonsCaption(candidate));
    const selected = current === candidate.id;
    const button = element('button', selected ? 'Withdraw approval' : `Upvote image (${count})`);
    button.type = 'button'; button.disabled = voteBusy; button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => void castImageVote(storyId, selected ? null : candidate.id));
    figure.append(button); grid.append(figure);
  }
  {
    const state = commonsSearches.get(storyId);
    const form = element('form', '', 'commons-search');
    const label = element('label', 'Search reusable images for a person, place or subject');
    const sourceLabel = element('label', 'Image source');
    const sourceSelect = element('select'); sourceSelect.setAttribute('aria-label', 'Image source');
    sourceSelect.dataset.imageAction = `${storyId}:source`;
    for (const [value, text] of [['all', 'All sources'], ['commons', 'Wikimedia Commons'], ['openverse', 'Openverse'], ['flickr', 'Flickr via Openverse'], ['eu', 'EU audiovisual library'], ['wellcome', 'Wellcome Collection via Openverse'], ['smithsonian', 'Smithsonian via Openverse'], ['europeana', 'Europeana via Openverse']]) {
      const option = element('option', text); option.value = value!; sourceSelect.append(option);
    }
    sourceSelect.value = state!.source; sourceSelect.disabled = !!state?.loading;
    sourceSelect.addEventListener('change', () => { if (state) { state.source = sourceSelect.value as ImageSource; void findCommons(storyId, state.query); } });
    sourceLabel.append(sourceSelect);
    const input = element('input'); input.type = 'search'; input.value = state!.query; input.maxLength = 200; input.required = true;
    input.dataset.imageAction = `${storyId}:search`;
    label.append(input);
    input.addEventListener('input', () => { if (state) state.query = input.value; });
    const submit = element('button', state?.loading ? 'Searching images…' : 'Search images'); submit.type = 'submit'; submit.disabled = !!state?.loading;
    form.addEventListener('submit', event => { event.preventDefault(); void findCommons(storyId, input.value); });
    form.append(sourceLabel, label, submit); details.append(form);
    details.append(element('p', voter === relayConfig.pubkey
      ? 'Everyone can see automatic suggestions. Publish and upvote your choice to share an approved image. This requests two signatures.'
      : 'Everyone can see automatic suggestions. Approve a published candidate to change the shared image. Stringer’s account must publish new candidates first.'));
    if (state?.error) details.append(element('p', state.error, 'warning'));
    else if (state?.issues.length) details.append(element('p', state.issues.join(' '), 'warning'));
    if (state?.searched && !state.loading && !state.error && !state.results.length)
      details.append(element('p', 'No reusable images found. Try a specific person, place or subject.'));
    for (const image of imageOptions(storyId)) {
      if (selection.scores.some(score => score.candidate.filePage === image.filePage)) continue;
      const figure = element('figure');
      const preview = element('img'); preview.src = image.url; preview.alt = image.alt; preview.width = 120; preview.height = 80; preview.loading = 'lazy'; preview.referrerPolicy = 'no-referrer';
      const publish = element('button', 'Publish and upvote image'); publish.type = 'button'; publish.disabled = voteBusy || voter !== relayConfig.pubkey;
      publish.addEventListener('click', () => void publishCommons(storyId, image));
      figure.append(choiceButton(image, preview), commonsCaption(image), publish); grid.append(figure);
    }
  }
  details.insertBefore(grid, details.querySelector('form'));
  control.append(open, details);
  return control;
}
async function publishCommons(storyId: string, image: CommonsImage) {
  const session = imageSession, account = voter, signer = window.nostr;
  if (!session || !account || !signer || voteBusy) return;
  const prior = session.selection(storyId).latest.get(account)?.vote.candidateId || null;
  voteBusy = true; voteMessage = 'Approve two signer requests: the image candidate, then your vote.'; renderWorld();
  try {
    const id = await session.propose(signer, account, storyId, image);
    await session.vote(signer, account, storyId, id);
    rememberImageAction(storyId, 'vote', prior, account);
    skippedImages.set(choiceKey(storyId, account), (skippedImages.get(choiceKey(storyId, account)) || []).filter(page => page !== image.filePage));
    voteMessage = 'Image and approval published.';
  } catch (error) { voteMessage = error instanceof Error ? error.message : 'Could not publish the image. Please retry.'; }
  finally { voteBusy = false; renderWorld(); }
}
function imageControls(storyId: string, title: string, image: CommonsImage | null | undefined) {
  const controls = element('div', '', 'image-controls');
  if (image) {
    const candidateId = 'id' in image && typeof image.id === 'string' ? image.id : null;
    const selected = candidateId && imageSession?.selection(storyId).latest.get(voter!)?.vote.candidateId === candidateId;
    const label = selected ? 'Withdraw approval' : candidateId ? 'Approve suggested image' : 'Publish and upvote image';
    const up = element('button', selected ? '✓' : '↑'); up.type = 'button'; up.title = label; up.setAttribute('aria-label', label);
    up.setAttribute('aria-pressed', String(!!selected)); up.dataset.imageAction = `${storyId}:up`;
    up.disabled = voteBusy || (!candidateId && voter !== relayConfig.pubkey);
    up.addEventListener('click', () => { if (candidateId) void castImageVote(storyId, selected ? null : candidateId); else void publishCommons(storyId, image); });
    const down = element('button', '↓'); down.type = 'button'; down.title = 'Skip image for me'; down.setAttribute('aria-label', 'Skip image for me');
    down.dataset.imageAction = `${storyId}:down`; down.disabled = voteBusy;
    down.addEventListener('click', () => skipImage(storyId, image));
    controls.append(up, down);
  }
  const undo = element('button', '↶'); undo.type = 'button'; undo.title = 'Undo image choice'; undo.setAttribute('aria-label', 'Undo image choice');
  undo.dataset.imageAction = `${storyId}:undo`; undo.disabled = voteBusy || !imageHistory.get(choiceKey(storyId))?.length;
  undo.addEventListener('click', () => void undoImage(storyId)); controls.append(undo);
  const review = imageReview(storyId, title);
  if (review) controls.append(review);
  return controls;
}
async function findCommons(storyId: string, query: string, suggest = false) {
  if (!searchImages || commonsSearches.get(storyId)?.loading) return;
  const state: CommonsSearch = commonsSearches.get(storyId) || { query, source: 'all', issues: [], loading: false, results: [], error: '', searched: false };
  Object.assign(state, { query, loading: true, results: state.query === query ? state.results : [], error: '', issues: [], searched: false });
  commonsSearches.set(storyId, state); renderWorld();
  try {
    const result = await searchImages(query, state.source, suggest, fetch, partial => {
      if (partial.images.length) state.results = partial.images; state.issues = partial.issues; renderWorld();
    });
    state.results = result.images; state.issues = result.issues;
    if (!result.images.length && result.issues.length) state.error = result.issues.join(' ');
  }
  catch (error) { state.error = error instanceof Error ? error.message : 'Image search is unavailable. Please retry.'; }
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
  for (const media of target.querySelectorAll('.wire-thumbnail')) suggestionObserver.unobserve(media);
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
    const imageStoryId = wire && !atomstrEdition ? story.noteId : undefined;
    const selection = imageStoryId ? imageSession?.selection(imageStoryId) : null;
    const trusted = hasSigner() && voter && imageSession?.canVote(voter);
    if (imageStoryId) prepareImageSearch(imageStoryId, story.title);
    const commons = imageStoryId
      ? imageOptions(imageStoryId).find(image => !skippedImages.get(choiceKey(imageStoryId))?.includes(image.filePage))
      : null;
    const imageData = wire ? commons : story.image;
    const imageUrl = wire ? commons?.url : safeImageUrl(imageData?.url) || localImage;
    let wireFigure: HTMLElement | null = null;
    if (wire && !atomstrEdition) {
      article.classList.add('with-image');
      wireFigure = element('figure', '', 'story-media wire-thumbnail');
      if (imageStoryId && !commonsSearches.get(imageStoryId)?.searched) {
        wireFigure.dataset.storyId = imageStoryId; suggestionObserver.observe(wireFigure);
      }
      article.append(wireFigure);
    }
    if (imageUrl) {
      const figure = wireFigure || element('figure', '', 'story-media');
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
        if (wire) {
          const failed = image.closest('a') || image;
          failed.replaceWith(element('span', 'Image unavailable', 'image-search-status'));
          return;
        }
        const placeholder = element('div', '', 'story-placeholder');
        placeholder.setAttribute('aria-hidden', 'true');
        image.replaceWith(placeholder);
      });
      image.src = imageUrl;
      if (wire && commons) {
        figure.classList.add('wire-thumbnail');
        const imageLink = element('a');
        imageLink.href = commons.filePage; imageLink.target = '_blank'; imageLink.rel = 'noopener noreferrer';
        imageLink.setAttribute('aria-label', `View ${commons.title} at ${commons.sourceName || 'Wikimedia Commons'}`);
        if (trusted) {
          imageLink.setAttribute('role', 'button');
          imageLink.setAttribute('aria-label', `Change image for ${story.title}`);
          imageLink.addEventListener('click', event => {
            event.preventDefault();
            article.querySelector<HTMLButtonElement>('[data-image-action$=":review"]')!.click();
          });
          imageLink.addEventListener('keydown', event => { if (event.key === ' ') { event.preventDefault(); imageLink.click(); } });
        }
        imageLink.append(image);
        figure.append(imageLink);
      } else figure.append(image);
      if (commons) figure.append(thumbnailCredit(commons, commons.filePage !== selection?.winner?.filePage));
      if (!wire && story.image?.credit) figure.append(element('figcaption', story.image.credit));
      article.classList.add('with-image'); if (!wire) article.append(figure);
    } else if (usePlaceholder) {
      showPlaceholder();
    }
    const link = element('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append(element('h3', story.title)); body.append(link);
    if (story.credits) body.append(element('p', story.credits, 'credits'));
    if (story.summary) body.append(element('p', story.summary, 'summary'));
    const meta = element('div', '', 'meta');
    const sourceLabel = element('span', story.source || new URL(url).hostname.replace(/^www\./, ''), 'source');
    if (locale.startsWith('pt-') && story.sourceCountry) {
      const flag = element('span', story.sourceCountry === 'BR' ? '🇧🇷' : '🇵🇹', 'source-flag');
      flag.setAttribute('role', 'img');
      flag.setAttribute('aria-label', story.sourceCountry === 'BR' ? 'Brasil' : 'Portugal');
      sourceLabel.prepend(flag, document.createTextNode(' '));
    }
    meta.append(sourceLabel);
    if (story.mirroredVia) meta.append(element('span', t('via {network} / Atomstr', {network: story.mirroredVia}), 'mirror-provenance'));
    const publishedAt = story.publishedAt || approvedMedia?.publishedAt;
    if (publishedAt) {
      const time = element('time', formatLocalDateTime(publishedAt, locale));
      time.title = t(story.atomstr ? 'Atomstr mirror timestamp ({zone})' : 'Local time ({zone})', {zone: Intl.DateTimeFormat().resolvedOptions().timeZone});
      time.dateTime = publishedAt; meta.append(time);
    } else if (story.publicationDate || approvedMedia?.publicationDate) {
      const publicationDate = story.publicationDate || approvedMedia?.publicationDate;
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
    if (imageStoryId && !commons) {
      const state = commonsSearches.get(imageStoryId);
      let message = 'Finding a suggested image…';
      if (state?.searched) {
        if (state.results.length) message = 'No more suggestions. Undo a skip or search again.';
        else if (trusted) message = 'No reusable image found. Open image review to refine the search.';
        else message = 'No reusable image found for this headline.';
      }
      wireFigure?.append(element('p', state?.error || message, state?.error ? 'warning' : 'image-search-status'));
    }
    if (imageStoryId && trusted) wireFigure?.insertBefore(imageControls(imageStoryId, story.title, commons), wireFigure.querySelector('figcaption'));
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
  const timing = loading ? t('Loading · {seconds} s elapsed', {seconds}) : t('{outcome} in {seconds} s', {outcome: t(loadOutcome), seconds});
  notes.push(loading ? t('{stage} Total elapsed: {seconds} s.', {stage: loadStage, seconds}) : t('Latest feed load: {timing}.', {timing}));
  if (Object.keys(feedTimings).length) {
    notes.push(t('Story retrieval from news relays:'));
    for (const source of SOURCES) {
      const feed = feedTimings[source.id];
      if (!feed) continue;
      const elapsed = ((feed.durationMs ?? performance.now() - feed.startedAt) / 1000).toFixed(1);
      const state = feed.state;
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
  summary.textContent = t('Feed status · {timing}', {timing: locale === 'en-US' ? timing.toLowerCase() : timing});
  summary.title = notes.join('\n');
}
function renderWorld() {
  if (!snapshot) return;
  const dialogScroll = [...document.querySelectorAll<HTMLDialogElement>('dialog.image-review[open]')].map(dialog => ({ id: dialog.id, top: dialog.scrollTop }));
  const focused = document.activeElement as HTMLElement | null;
  const focusAction = focused?.dataset.imageAction;
  const selectionRange = focused instanceof HTMLInputElement ? [focused.selectionStart, focused.selectionEnd] : null;
  const current = snapshot;
  syncImages();
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
    for (const { name, homepage, linkLabel } of SOURCES.filter(source => source.id !== 'stringer')) {
      const link = element('a', linkLabel || name); link.href = homepage; link.target = '_blank'; link.rel = 'noopener noreferrer';
      if (links.childNodes.length) links.append(document.createTextNode(' · '));
      links.append(link);
    }
    list.append(links);
  }
  renderStatuses();
  updateStoryVisibility();
  queueMicrotask(() => { for (const { id, top } of dialogScroll) { const dialog = document.getElementById(id); if (dialog) dialog.scrollTop = top; } });
  if (focusAction) queueMicrotask(() => {
    const next = [...document.querySelectorAll<HTMLElement>('[data-image-action]')].find(node => node.dataset.imageAction === focusAction);
    next?.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement && selectionRange) next.setSelectionRange(selectionRange[0]!, selectionRange[1]!);
  });
}
function render() {
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
      ImageSessionClass = reader.ImageSession;
      searchImages = reader.searchImages;
      commonsSubject = reader.commonsSubject;
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
    loadOutcome = Object.values(next.sources).some(source => source.unavailable) ? 'Partially loaded' : 'Loaded';
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

// Image commands share the same eligibility and signer checks as their UI controls.
export { connectNostr, detectNostr, imageOptions, imageReview, skipImage, undoImage, castImageVote, publishCommons, findCommons, loadSuggestions, renderWorld, syncImages };
