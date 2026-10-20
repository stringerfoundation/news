import { readResponseText } from "./response.js?v=6ba554e31f0f285e";
import { SOURCES, CONTENT_PERMISSIONS, applyContentPermissions, safeUrl, safeImageUrl, validateSnapshot, worldStories, formatLocalDateTime, formatPublicationDate } from "./news-model.js?v=6ba554e31f0f285e";
import relayConfig from "./relay-config.js?v=6ba554e31f0f285e";
import { STRINGER_MEDIA } from "./stringer-media.js?v=6ba554e31f0f285e";
function requiredElement(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing reader element: ${selector}`);
  return node;
}
const menuToggle = requiredElement(".header-menu-toggle");
const headerMenu = requiredElement("#header-menu");
function setHeaderMenu(open) {
  headerMenu.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}
menuToggle.addEventListener("click", () => setHeaderMenu(menuToggle.getAttribute("aria-expanded") !== "true"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    setHeaderMenu(false);
    menuToggle.focus();
  }
});
matchMedia("(max-width: 920px)").addEventListener("change", () => setHeaderMenu(false));
const feedback = requiredElement("#refresh-status");
const publisherSources = SOURCES.filter((source) => source.id !== "stringer");
const selectedSources = () => publisherSources.map((source) => source.id);
const interval = 5 * 60 * 1e3;
let snapshot = null;
const retainedSources = /* @__PURE__ */ new Map();
function displayedSnapshot() {
  return { ...snapshot, sources: Object.fromEntries(Object.entries(snapshot.sources).map(([id, source]) => [id, retainedSources.get(id) ?? source])) };
}
let loading = false;
let lastAttempt = 0;
let loadStarted = 0;
let loadDuration = 0;
let loadOutcome = "";
let loadStage = "";
let feedTimings = {};
let ImageSessionClass = null;
let searchImages = null;
let commonsSubject;
const commonsSearches = /* @__PURE__ */ new Map();
const suggestionQueue = /* @__PURE__ */ new Set();
let activeSuggestions = 0;
const suggestionObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    suggestionObserver.unobserve(entry.target);
    const id = entry.target.dataset.storyId;
    if (id) suggestionQueue.add(id);
  }
  loadSuggestions();
}, { rootMargin: "100px" });
function loadSuggestions() {
  if (!voter || !imageSession?.canVote(voter)) {
    suggestionQueue.clear();
    return;
  }
  for (const id of suggestionQueue) {
    if (activeSuggestions >= 2) break;
    suggestionQueue.delete(id);
    const state = commonsSearches.get(id);
    if (!state || state.loading || state.searched || !imageSession.refs[id]) continue;
    activeSuggestions++;
    void findCommons(id, state.query, true).finally(() => {
      activeSuggestions--;
      loadSuggestions();
    });
  }
}
let imageSession = null;
let imageRefsKey = "";
let voter = null;
let accountNpub = "";
let accountNip05 = null;
let identityPending = false;
let connectingSigner = false;
let accountRevision = 0;
let attemptedSigner;
let voteBusy = false;
let voteMessage = "";
const openImageReviews = /* @__PURE__ */ new Set();
const chosenImages = /* @__PURE__ */ new Map();
const skippedImages = /* @__PURE__ */ new Map();
const imageHistory = /* @__PURE__ */ new Map();
const choiceKey = (storyId, account = voter) => `${account}:${storyId}`;
function rememberImageAction(storyId, kind, candidateId, account = voter) {
  const key = choiceKey(storyId, account), history = imageHistory.get(key) || [];
  history.push({ kind, candidateId, chosen: chosenImages.get(key) || null, skipped: [...skippedImages.get(key) || []] });
  imageHistory.set(key, history.slice(-100));
}
function imageOptions(storyId) {
  const selection = imageSession?.selection(storyId);
  const chosen = chosenImages.get(choiceKey(storyId));
  const images = [...chosen ? [selection?.scores.find((score) => score.candidate.filePage === chosen.filePage)?.candidate || chosen] : [], ...selection?.winner ? [selection.winner] : [], ...selection?.scores.map((score) => score.candidate) || [], ...commonsSearches.get(storyId)?.results || []];
  return images.filter((image, index) => images.findIndex((other) => other.filePage === image.filePage) === index);
}
function skipImage(storyId, image) {
  if (!voter || !imageSession?.canVote(voter) || voteBusy) return;
  rememberImageAction(storyId, "skip", null);
  const key = choiceKey(storyId);
  skippedImages.set(key, [...skippedImages.get(key) || [], image.filePage]);
  renderWorld();
}
async function undoImage(storyId) {
  const key = choiceKey(storyId), history = imageHistory.get(key), action = history?.at(-1);
  if (!action || voteBusy) return;
  if (action.kind === "vote" && !await castImageVote(storyId, action.candidateId, false)) return;
  if (action.chosen) chosenImages.set(key, action.chosen);
  else chosenImages.delete(key);
  skippedImages.set(key, [...action.skipped]);
  history.pop();
  renderWorld();
}
async function castImageVote(storyId, candidateId, remember = true) {
  const session = imageSession, account = voter, signer = window.nostr;
  if (!session || !account || !signer || voteBusy) return false;
  const prior = session.selection(storyId).latest.get(account)?.vote.candidateId || null;
  voteBusy = true;
  voteMessage = "Waiting for your signer and relay confirmation\u2026";
  renderWorld();
  let published = false;
  try {
    const previousTime = session.selection(storyId).latest.get(account)?.event.created_at;
    const delay = previousTime ? (previousTime + 1) * 1e3 - Date.now() : 0;
    if (delay > 0 && delay < 2e3) await new Promise((resolve) => setTimeout(resolve, delay));
    await session.vote(signer, account, storyId, candidateId);
    if (remember) rememberImageAction(storyId, "vote", prior, account);
    const image = candidateId ? session.candidates.get(candidateId) : null;
    if (image) skippedImages.set(choiceKey(storyId, account), (skippedImages.get(choiceKey(storyId, account)) || []).filter((page) => page !== image.filePage));
    voteMessage = remember ? "Vote published." : "Previous approval restored.";
    published = true;
  } catch (error) {
    voteMessage = error instanceof Error ? error.message : "Could not publish your vote. Please retry.";
  } finally {
    voteBusy = false;
    renderWorld();
  }
  return published;
}
const imageToolbar = element("div", "", "image-toolbar");
imageToolbar.hidden = true;
requiredElement("#world-news").before(imageToolbar);
function syncImages() {
  const refs = snapshot?.imageCandidates || {};
  const storyIds = Object.entries(snapshot?.sources || {}).filter(([id]) => id !== "stringer").flatMap(([, source]) => source.stories.flatMap((story) => story.noteId ? [story.noteId] : []));
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
  return typeof window.nostr?.getPublicKey === "function" && typeof window.nostr?.signEvent === "function";
}
function refreshAccount() {
  if (snapshot) renderWorld();
  else renderNostrAccount();
}
async function connectNostr() {
  if (!hasSigner() || connectingSigner) return;
  const signer = window.nostr, revision = ++accountRevision;
  connectingSigner = true;
  voteMessage = "";
  renderNostrAccount();
  try {
    const key = await signer.getPublicKey();
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("The signer returned an invalid account.");
    const identity = await import("./relay-reader.js?v=6ba554e31f0f285e");
    if (revision !== accountRevision || window.nostr !== signer) return;
    voter = key;
    accountNpub = identity.npubEncode(key);
    accountNip05 = null;
    identityPending = true;
    connectingSigner = false;
    refreshAccount();
    const address = await identity.readIdentity(key, relayConfig.relays, key === relayConfig.pubkey ? "_@stringerjournalism.org" : void 0);
    if (revision !== accountRevision || voter !== key || window.nostr !== signer) return;
    accountNip05 = address;
    identityPending = false;
    refreshAccount();
  } catch (error) {
    if (revision !== accountRevision) return;
    if (voter) {
      identityPending = false;
      accountNip05 = null;
    } else voteMessage = error instanceof Error ? error.message : "Could not connect to your signer.";
  } finally {
    if (revision === accountRevision) {
      connectingSigner = false;
      refreshAccount();
    }
  }
}
function renderNostrAccount() {
  imageToolbar.replaceChildren();
  imageToolbar.hidden = !hasSigner();
  if (imageToolbar.hidden) return;
  if (voter) {
    const identity = element("div", "", "nostr-identity");
    const npub = element("code", accountNpub);
    npub.className = "account-npub";
    identity.append(npub, element("span", identityPending ? "Looking up NIP-05\u2026" : accountNip05 || "NIP-05 unavailable", "account-nip05"));
    imageToolbar.append(identity);
  }
  const connect = element("button", connectingSigner ? "Connecting Nostr\u2026" : voter ? "Disconnect Nostr" : "Connect Nostr");
  connect.type = "button";
  connect.disabled = voteBusy || connectingSigner;
  connect.addEventListener("click", () => {
    if (voter) {
      ++accountRevision;
      voter = null;
      accountNpub = "";
      accountNip05 = null;
      identityPending = false;
      voteMessage = "";
      refreshAccount();
    } else void connectNostr();
  });
  imageToolbar.append(connect);
  let status = voter && imageSession?.trustLive && !imageSession.canVote(voter) ? "This account is not followed by Stringer and cannot approve images." : voteMessage;
  if (!status && voter && imageSession) status = imageSession.canVote(voter) ? "You can approve illustrative images." : "Waiting for Stringer\u2019s follow list.";
  const message = element("p", status);
  message.setAttribute("role", "status");
  imageToolbar.append(message);
}
function detectNostr() {
  if (!hasSigner()) {
    if (voter) {
      ++accountRevision;
      voter = null;
      accountNpub = "";
      accountNip05 = null;
      identityPending = false;
      refreshAccount();
    } else renderNostrAccount();
    return;
  }
  if (attemptedSigner === window.nostr) return;
  attemptedSigner = window.nostr;
  void connectNostr();
}
let signerChecks = 0;
const signerTimer = setInterval(() => {
  detectNostr();
  if (++signerChecks >= 40 || attemptedSigner) clearInterval(signerTimer);
}, 250);
window.addEventListener("load", detectNostr);
window.addEventListener("nostr:ready", detectNostr);
detectNostr();
function commonsCaption(candidate) {
  const caption = element("figcaption");
  caption.append(document.createTextNode(`Illustrative image \xB7 ${candidate.creator} \xB7 ${candidate.attribution} \xB7 `));
  for (const [label, url] of [[candidate.title, candidate.filePage], [candidate.license, candidate.licenseUrl]]) {
    if (caption.lastChild?.nodeType === Node.ELEMENT_NODE) caption.append(document.createTextNode(" \xB7 "));
    const link = element("a", label);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    caption.append(link);
  }
  if (candidate.sourceName) caption.append(document.createTextNode(` \xB7 ${candidate.sourceName}`));
  return caption;
}
function imageReview(storyId, title) {
  if (!hasSigner() || !voter || !imageSession?.canVote(voter)) return null;
  const selection = imageSession.selection(storyId);
  if (!commonsSearches.has(storyId)) {
    commonsSearches.set(storyId, { query: commonsSubject(title), source: "all", issues: [], loading: false, results: [], error: "", searched: false });
  }
  const control = element("div", "", "image-review-control");
  control.dataset.storyId = storyId;
  if (!commonsSearches.get(storyId)?.searched) suggestionObserver.observe(control);
  const details = element("dialog", "", "image-review");
  details.id = `image-review-${storyId}`;
  details.setAttribute("aria-label", `Image choices for ${title}`);
  const open = element("button", "\u22EF");
  open.type = "button";
  open.title = "Review illustrative images";
  open.setAttribute("aria-label", "Review illustrative images");
  open.dataset.imageAction = `${storyId}:review`;
  const closeReview = () => {
    openImageReviews.delete(storyId);
    details.close();
    open.focus();
  };
  open.addEventListener("click", () => {
    const visible = imageOptions(storyId).find((image) => !skippedImages.get(choiceKey(storyId))?.includes(image.filePage));
    if (visible) chosenImages.set(choiceKey(storyId), visible);
    openImageReviews.add(storyId);
    details.showModal();
    const state = commonsSearches.get(storyId);
    if (state && !state.loading) void findCommons(storyId, state.query);
  });
  const close = element("button", "Close image review");
  close.type = "button";
  close.addEventListener("click", closeReview);
  details.addEventListener("cancel", () => {
    openImageReviews.delete(storyId);
  });
  details.append(close, element("h3", title), element("p", "Click an image to choose it. Approve it afterwards to share it with other readers."));
  queueMicrotask(() => {
    if (details.isConnected && openImageReviews.has(storyId)) details.showModal();
  });
  const grid = element("div", "", "image-choice-grid");
  const choose = (image) => {
    rememberImageAction(storyId, "choose", null);
    chosenImages.set(choiceKey(storyId), image);
    skippedImages.set(choiceKey(storyId), (skippedImages.get(choiceKey(storyId)) || []).filter((page) => page !== image.filePage));
    closeReview();
    renderWorld();
    queueMicrotask(() => document.querySelector(`[data-image-action="${storyId}:up"]`)?.focus());
  };
  const choiceButton = (image, img) => {
    const button = element("button", "", "image-choice");
    button.type = "button";
    button.setAttribute("aria-label", `Choose image: ${image.title}`);
    button.dataset.imageAction = `${storyId}:choose:${image.filePage}`;
    button.setAttribute("aria-pressed", String(chosenImages.get(choiceKey(storyId))?.filePage === image.filePage));
    button.append(img);
    button.addEventListener("click", () => choose(image));
    return button;
  };
  const current = selection.latest.get(voter)?.vote.candidateId;
  for (const { candidate, count } of selection.scores) {
    const figure = element("figure");
    const img = element("img");
    img.src = candidate.url;
    img.alt = candidate.alt;
    img.width = 120;
    img.height = 80;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    figure.append(choiceButton(candidate, img), commonsCaption(candidate));
    const selected = current === candidate.id;
    const button = element("button", selected ? "Withdraw approval" : `Upvote image (${count})`);
    button.type = "button";
    button.disabled = voteBusy;
    button.setAttribute("aria-pressed", String(selected));
    button.addEventListener("click", () => void castImageVote(storyId, selected ? null : candidate.id));
    figure.append(button);
    grid.append(figure);
  }
  {
    const state = commonsSearches.get(storyId);
    const form = element("form", "", "commons-search");
    const label = element("label", "Search reusable images for a person, place or subject");
    const sourceLabel = element("label", "Image source");
    const sourceSelect = element("select");
    sourceSelect.setAttribute("aria-label", "Image source");
    sourceSelect.dataset.imageAction = `${storyId}:source`;
    for (const [value, text] of [["all", "All sources"], ["commons", "Wikimedia Commons"], ["openverse", "Openverse"], ["flickr", "Flickr via Openverse"], ["eu", "EU audiovisual library"], ["wellcome", "Wellcome Collection via Openverse"], ["smithsonian", "Smithsonian via Openverse"], ["europeana", "Europeana via Openverse"]]) {
      const option = element("option", text);
      option.value = value;
      sourceSelect.append(option);
    }
    sourceSelect.value = state.source;
    sourceSelect.disabled = !!state?.loading;
    sourceSelect.addEventListener("change", () => {
      if (state) {
        state.source = sourceSelect.value;
        void findCommons(storyId, state.query);
      }
    });
    sourceLabel.append(sourceSelect);
    const input = element("input");
    input.type = "search";
    input.value = state.query;
    input.maxLength = 200;
    input.required = true;
    input.dataset.imageAction = `${storyId}:search`;
    label.append(input);
    input.addEventListener("input", () => {
      if (state) state.query = input.value;
    });
    const submit = element("button", state?.loading ? "Searching images\u2026" : "Search images");
    submit.type = "submit";
    submit.disabled = !!state?.loading;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void findCommons(storyId, input.value);
    });
    form.append(sourceLabel, label, submit);
    details.append(form);
    details.append(element("p", voter === relayConfig.pubkey ? "Suggested images need approval before other readers can see them. Publishing and upvoting requests two signatures." : "Suggested images need approval before other readers can see them. Stringer\u2019s account must publish new candidates first."));
    if (state?.error) details.append(element("p", state.error, "warning"));
    else if (state?.issues.length) details.append(element("p", state.issues.join(" "), "warning"));
    if (state?.searched && !state.loading && !state.error && !state.results.length)
      details.append(element("p", "No reusable images found. Try a specific person, place or subject."));
    for (const image of imageOptions(storyId)) {
      if (selection.scores.some((score) => score.candidate.filePage === image.filePage)) continue;
      const figure = element("figure");
      const preview = element("img");
      preview.src = image.url;
      preview.alt = image.alt;
      preview.width = 120;
      preview.height = 80;
      preview.loading = "lazy";
      preview.referrerPolicy = "no-referrer";
      const publish = element("button", "Publish and upvote image");
      publish.type = "button";
      publish.disabled = voteBusy || voter !== relayConfig.pubkey;
      publish.addEventListener("click", () => void publishCommons(storyId, image));
      figure.append(choiceButton(image, preview), commonsCaption(image), publish);
      grid.append(figure);
    }
  }
  details.insertBefore(grid, details.querySelector("form"));
  control.append(open, details);
  return control;
}
async function publishCommons(storyId, image) {
  const session = imageSession, account = voter, signer = window.nostr;
  if (!session || !account || !signer || voteBusy) return;
  const prior = session.selection(storyId).latest.get(account)?.vote.candidateId || null;
  voteBusy = true;
  voteMessage = "Approve two signer requests: the image candidate, then your vote.";
  renderWorld();
  try {
    const id = await session.propose(signer, account, storyId, image);
    await session.vote(signer, account, storyId, id);
    rememberImageAction(storyId, "vote", prior, account);
    skippedImages.set(choiceKey(storyId, account), (skippedImages.get(choiceKey(storyId, account)) || []).filter((page) => page !== image.filePage));
    voteMessage = "Image and approval published.";
  } catch (error) {
    voteMessage = error instanceof Error ? error.message : "Could not publish the image. Please retry.";
  } finally {
    voteBusy = false;
    renderWorld();
  }
}
function imageControls(storyId, title, image) {
  const controls = element("div", "", "image-controls");
  if (image) {
    const candidateId = "id" in image && typeof image.id === "string" ? image.id : null;
    const selected = candidateId && imageSession?.selection(storyId).latest.get(voter)?.vote.candidateId === candidateId;
    const label = selected ? "Withdraw approval" : candidateId ? "Approve suggested image" : "Publish and upvote image";
    const up = element("button", selected ? "\u2713" : "\u2191");
    up.type = "button";
    up.title = label;
    up.setAttribute("aria-label", label);
    up.setAttribute("aria-pressed", String(!!selected));
    up.dataset.imageAction = `${storyId}:up`;
    up.disabled = voteBusy || !candidateId && voter !== relayConfig.pubkey;
    up.addEventListener("click", () => {
      if (candidateId) void castImageVote(storyId, selected ? null : candidateId);
      else void publishCommons(storyId, image);
    });
    const down = element("button", "\u2193");
    down.type = "button";
    down.title = "Skip image for me";
    down.setAttribute("aria-label", "Skip image for me");
    down.dataset.imageAction = `${storyId}:down`;
    down.disabled = voteBusy;
    down.addEventListener("click", () => skipImage(storyId, image));
    controls.append(up, down);
  }
  const undo = element("button", "\u21B6");
  undo.type = "button";
  undo.title = "Undo image choice";
  undo.setAttribute("aria-label", "Undo image choice");
  undo.dataset.imageAction = `${storyId}:undo`;
  undo.disabled = voteBusy || !imageHistory.get(choiceKey(storyId))?.length;
  undo.addEventListener("click", () => void undoImage(storyId));
  controls.append(undo);
  const review = imageReview(storyId, title);
  if (review) controls.append(review);
  return controls;
}
async function findCommons(storyId, query, suggest = false) {
  if (!searchImages || commonsSearches.get(storyId)?.loading) return;
  const state = commonsSearches.get(storyId) || { query, source: "all", issues: [], loading: false, results: [], error: "", searched: false };
  Object.assign(state, { query, loading: true, results: state.query === query ? state.results : [], error: "", issues: [], searched: false });
  commonsSearches.set(storyId, state);
  renderWorld();
  try {
    const result = await searchImages(query, state.source, suggest, fetch, (partial) => {
      if (partial.images.length) state.results = partial.images;
      state.issues = partial.issues;
      renderWorld();
    });
    state.results = result.images;
    state.issues = result.issues;
    if (!result.images.length && result.issues.length) state.error = result.issues.join(" ");
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Image search is unavailable. Please retry.";
  } finally {
    state.loading = false;
    state.searched = true;
    renderWorld();
  }
}
window.addEventListener("pagehide", () => imageSession?.close());
window.addEventListener("pageshow", (event) => {
  if (event.persisted && snapshot) {
    imageRefsKey = "";
    renderWorld();
  }
});
const stringerOrder = /* @__PURE__ */ new Map();
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
  for (const review of target.querySelectorAll(".image-review-control")) suggestionObserver.unobserve(review);
  target.replaceChildren();
  const usePlaceholder = target.id === "stringer-news";
  const wire = target.id === "world-news";
  for (const [index, story] of stories.entries()) {
    const url = safeUrl(story.url);
    if (!url) continue;
    const approvedMedia = usePlaceholder ? STRINGER_MEDIA.get(url) : null;
    const localImage = CONTENT_PERMISSIONS.stringer.images ? approvedMedia?.image : null;
    const article = element("article", "", "story");
    const body = element("div", "", "story-body");
    const showPlaceholder = () => {
      const placeholder = element("div", "", "story-media story-placeholder");
      placeholder.setAttribute("aria-hidden", "true");
      article.classList.add("with-image");
      article.prepend(placeholder);
    };
    const selection = wire && story.noteId ? imageSession?.selection(story.noteId) : null;
    const trusted = hasSigner() && voter && imageSession?.canVote(voter);
    const commons = wire && story.noteId && trusted ? imageOptions(story.noteId).find((image) => !skippedImages.get(choiceKey(story.noteId))?.includes(image.filePage)) : selection?.winner;
    const suggested = commons && commons.filePage !== selection?.winner?.filePage ? commons : null;
    const imageData = wire ? commons : story.image;
    const imageUrl = wire ? commons?.url : safeImageUrl(imageData?.url) || localImage;
    let wireFigure = null;
    if (wire) {
      article.classList.add("with-image");
      wireFigure = element("figure", "", "story-media wire-thumbnail");
      article.append(wireFigure);
    }
    if (imageUrl) {
      const figure = wireFigure || element("figure", "", "story-media");
      const image = element("img");
      image.alt = imageData?.alt || "";
      image.width = wire ? 120 : 240;
      image.height = wire ? 80 : 240;
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      let triedLocal = imageUrl === localImage;
      image.addEventListener("error", () => {
        if (localImage && !triedLocal) {
          triedLocal = true;
          image.src = localImage;
          return;
        }
        if (wire) {
          const failed = image.closest("a") || image;
          failed.replaceWith(element("span", "Image unavailable", "image-search-status"));
          return;
        }
        const placeholder = element("div", "", "story-placeholder");
        placeholder.setAttribute("aria-hidden", "true");
        image.replaceWith(placeholder);
      });
      image.src = imageUrl;
      if (wire && commons) {
        figure.classList.add("wire-thumbnail");
        const imageLink = element("a");
        imageLink.href = commons.filePage;
        imageLink.target = "_blank";
        imageLink.rel = "noopener noreferrer";
        imageLink.setAttribute("aria-label", `View ${commons.title} at ${commons.sourceName || "Wikimedia Commons"}`);
        imageLink.append(image);
        figure.append(imageLink);
      } else figure.append(image);
      if (commons) {
        const caption = commonsCaption(commons);
        caption.tabIndex = 0;
        figure.append(caption);
      }
      if (!wire && story.image?.credit) figure.append(element("figcaption", story.image.credit));
      article.classList.add("with-image");
      if (!wire) article.append(figure);
    } else if (usePlaceholder) {
      showPlaceholder();
    }
    const link = element("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(element("h3", story.title));
    body.append(link);
    if (story.credits) body.append(element("p", story.credits, "credits"));
    if (story.summary) body.append(element("p", story.summary, "summary"));
    const meta = element("div", "", "meta");
    meta.append(element("span", story.source || new URL(url).hostname.replace(/^www\./, ""), "source"));
    const publishedAt = story.publishedAt || approvedMedia?.publishedAt;
    if (publishedAt) {
      const time = element("time", formatLocalDateTime(publishedAt));
      time.title = `Local time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
      time.dateTime = publishedAt;
      meta.append(time);
    } else if (story.publicationDate || approvedMedia?.publicationDate) {
      const publicationDate = story.publicationDate || approvedMedia?.publicationDate;
      const time = element("time", formatPublicationDate(publicationDate));
      time.dateTime = publicationDate;
      time.title = "Publication date; source does not provide a confirmed time zone and time";
      meta.append(time);
    } else if (story.credits) {
      meta.append(element("span", "Publication date unavailable"));
    }
    if (meta.querySelector("time")) {
      const separator = element("span", "\xB7");
      separator.setAttribute("aria-hidden", "true");
      meta.firstElementChild.after(separator);
    }
    body.append(meta);
    if (suggested && story.noteId) {
      const pending = element("p", "Needs approval", "image-approval-status");
      pending.title = "Needs approval \u2014 only visible to trusted accounts.";
      pending.setAttribute("aria-label", pending.title);
      wireFigure?.insertBefore(pending, wireFigure.querySelector("figcaption"));
    } else if (wire && story.noteId && trusted && !commons) {
      const state = commonsSearches.get(story.noteId);
      wireFigure?.append(element("p", state?.error || (state?.searched ? state.results.length ? "No more suggestions. Undo a skip or search again." : "No reusable image found. Open image review to refine the search." : "Finding a suggested image\u2026"), state?.error ? "warning" : "image-search-status"));
    }
    if (wire && story.noteId && trusted) wireFigure?.insertBefore(imageControls(story.noteId, story.title, commons), wireFigure.querySelector("figcaption"));
    article.append(body);
    target.append(article);
  }
  if (!target.children.length && emptyMessage) target.append(element("p", emptyMessage, "empty"));
}
const mobileLayout = matchMedia("(max-width: 767px)");
const sections = [
  { list: requiredElement("#world-news"), button: requiredElement("#world-more"), label: "headlines", expanded: false },
  { list: requiredElement("#stringer-news"), button: requiredElement("#stringer-more"), label: "courageous stories", expanded: false }
];
function updateStoryVisibility() {
  for (const section of sections) {
    const cards = [...section.list.querySelectorAll("article")];
    cards.forEach((card, index) => {
      card.hidden = mobileLayout.matches && !section.expanded && index >= 5;
    });
    section.button.hidden = !mobileLayout.matches || cards.length <= 5;
    section.button.setAttribute("aria-expanded", String(section.expanded));
    section.button.textContent = `Show ${section.expanded ? "fewer" : "more"} ${section.label}`;
    section.button.setAttribute("aria-label", section.button.textContent);
  }
  if (!mobileLayout.matches) {
    const stringer = requiredElement("#stringer-news");
    if (!stringer.querySelector("article")) return;
    const bottom = stringer.getBoundingClientRect().bottom;
    let reachedEnd = false;
    for (const card of requiredElement("#world-news").querySelectorAll("article")) {
      card.hidden = reachedEnd;
      if (!reachedEnd && card.getBoundingClientRect().bottom >= bottom) reachedEnd = true;
    }
  }
}
for (const section of sections) {
  section.button.addEventListener("click", () => {
    section.expanded = !section.expanded;
    updateStoryVisibility();
  });
}
mobileLayout.addEventListener("change", updateStoryVisibility);
function renderStatuses() {
  const relayStatus = requiredElement("#relay-status");
  const relayDetails = requiredElement("#relay-status-details");
  relayDetails.replaceChildren();
  const notes = [];
  const seconds = ((loading ? performance.now() - loadStarted : loadDuration) / 1e3).toFixed(1);
  const timing = loading ? `Loading \xB7 ${seconds} s elapsed` : `${loadOutcome} in ${seconds} s`;
  notes.push(loading ? `${loadStage} Total elapsed: ${seconds} s.` : `Latest feed load: ${timing.toLowerCase()}.`);
  if (Object.keys(feedTimings).length) {
    notes.push("Story retrieval from news relays:");
    for (const source of SOURCES) {
      const feed = feedTimings[source.id];
      if (!feed) continue;
      const elapsed = ((feed.durationMs ?? performance.now() - feed.startedAt) / 1e3).toFixed(1);
      const state = feed.state;
      const description = state === "empty" ? "no published stories" : state === "loaded" ? `loaded in ${elapsed} s` : state === "loading" ? `loading \xB7 ${elapsed} s elapsed \xB7 ${feed.received}/${feed.total} stories` : `${feed.received}/${feed.total} stories received after ${elapsed} s`;
      notes.push(`${source.name} \xB7 ${description}`);
    }
  }
  if (snapshot) for (const group of ["world", "stringer"]) {
    const target = requiredElement(`#${group}-status`);
    target.replaceChildren();
    const sources = SOURCES.filter((s) => group === "stringer" ? s.id === "stringer" : s.id !== "stringer");
    for (const source of sources) {
      const entry = snapshot.sources[source.id];
      if (entry.status === "paused") continue;
      const retained = retainedSources.get(source.id);
      if (retained) notes.push(`${source.name} \xB7 Showing ${retained.stories.length} previously collected stories${retained.lastSuccessAt ? ` from ${formatLocalDateTime(retained.lastSuccessAt)}` : ""}.`);
      if (relayConfig.enabled) {
        const counts = [];
        if ((entry.unavailable ?? 0) > 0 && !loading) counts.push(`${entry.unavailable} unavailable`);
        if ((entry.pending ?? 0) > 0) counts.push(`${entry.pending} queued`);
        if (counts.length) notes.push(`${source.name} \xB7 ${counts.join(" \xB7 ")}`);
      }
      if (entry.status === "failure" && !(loading && entry.unavailable)) target.append(element("p", `${source.name}: refresh unavailable.${retained?.stories.length || entry.stories.length ? " Showing previously collected stories." : " No stories available."}`, "warning"));
    }
  }
  for (const note of notes) relayDetails.append(element("p", note));
  relayStatus.hidden = notes.length === 0;
  const summary = relayStatus.querySelector("summary");
  summary.textContent = `Feed status \xB7 ${timing.toLowerCase()}`;
  summary.title = notes.join("\n");
}
function renderWorld() {
  if (!snapshot) return;
  const dialogScroll = [...document.querySelectorAll("dialog.image-review[open]")].map((dialog) => ({ id: dialog.id, top: dialog.scrollTop }));
  const focused = document.activeElement;
  const focusAction = focused?.dataset.imageAction;
  const selectionRange = focused instanceof HTMLInputElement ? [focused.selectionStart, focused.selectionEnd] : null;
  const current = snapshot;
  syncImages();
  const selected = selectedSources();
  const worldPaused = selected.length > 0 && selected.every((id) => current.sources[id].status === "paused");
  const list = requiredElement("#world-news");
  renderStories(list, worldStories(displayedSnapshot(), selected), loading ? "" : worldPaused ? "Global headlines are currently unavailable." : "No headlines available in this collection.");
  if (worldPaused) {
    const links = element("p", "", "publisher-links");
    for (const { name, homepage, linkLabel } of publisherSources) {
      const link = element("a", linkLabel || name);
      link.href = homepage;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (links.childNodes.length) links.append(document.createTextNode(" \xB7 "));
      links.append(link);
    }
    list.append(links);
  }
  renderStatuses();
  updateStoryVisibility();
  queueMicrotask(() => {
    for (const { id, top } of dialogScroll) {
      const dialog = document.getElementById(id);
      if (dialog) dialog.scrollTop = top;
    }
  });
  if (focusAction) queueMicrotask(() => {
    const next = [...document.querySelectorAll("[data-image-action]")].find((node) => node.dataset.imageAction === focusAction);
    next?.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement && selectionRange) next.setSelectionRange(selectionRange[0], selectionRange[1]);
  });
}
function render() {
  renderStories(requiredElement("#stringer-news"), shuffledStringerStories(displayedSnapshot().sources.stringer.stories), loading ? "" : "Courageous stories are currently unavailable. Visit the Stringer collection below.");
  renderWorld();
}
async function load() {
  if (loading) return;
  loading = true;
  lastAttempt = Date.now();
  loadStarted = performance.now();
  loadStage = snapshot ? "Checking for updates\u2026" : "Loading news\u2026";
  loadOutcome = "";
  feedTimings = {};
  renderStatuses();
  const loadTimer = setInterval(renderStatuses, 1e3);
  document.querySelectorAll(".story-list").forEach((list) => list.setAttribute("aria-busy", "true"));
  feedback.textContent = "";
  try {
    let next;
    if (relayConfig.enabled) {
      const reader = await import("./relay-reader.js?v=6ba554e31f0f285e");
      ImageSessionClass = reader.ImageSession;
      searchImages = reader.searchImages;
      commonsSubject = reader.commonsSubject;
      if (!snapshot) {
        snapshot = reader.cachedRelaySnapshot(relayConfig);
        if (snapshot) render();
      }
      next = await reader.readRelaySnapshot(relayConfig, (message) => {
        loadStage = message;
        renderStatuses();
        console.info("[Stringer reader]", message);
      }, (partial) => {
        if (snapshot && Date.parse(partial.generatedAt) < Date.parse(snapshot.generatedAt)) return;
        for (const source of SOURCES) {
          const current = partial.sources[source.id];
          const previous = retainedSources.get(source.id) ?? snapshot?.sources[source.id];
          if (previous && current.status !== "paused" && previous.stories.length > current.stories.length)
            retainedSources.set(source.id, previous);
          else retainedSources.delete(source.id);
        }
        snapshot = partial;
        render();
      }, (timings) => {
        feedTimings = timings;
        renderStatuses();
      });
    } else {
      const response = await fetch("./data/news.json", { cache: "no-cache", credentials: "omit", signal: AbortSignal.timeout(15e3) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      next = applyContentPermissions(validateSnapshot(JSON.parse(await readResponseText(response))));
    }
    if (snapshot && Date.parse(next.generatedAt) < Date.parse(snapshot.generatedAt)) throw new Error("Older snapshot returned");
    retainedSources.clear();
    snapshot = next;
    render();
    loadOutcome = Object.values(next.sources).some((source) => source.unavailable) ? "Partially loaded" : "Loaded";
    feedback.textContent = "";
  } catch (error) {
    loadOutcome = "Failed";
    console.error("[Stringer reader] Collection refresh failed:", error);
    feedback.textContent = snapshot ? "Could not check for updates. Keeping the previously loaded collection." : "The news collection is unavailable. We\u2019ll retry automatically.";
    if (!snapshot) {
      requiredElement("#world-status").textContent = "Headlines unavailable.";
      requiredElement("#stringer-status").textContent = "Courageous stories unavailable. You can still visit the Stringer collection below.";
    }
  } finally {
    loadDuration = performance.now() - loadStarted;
    for (const feed of Object.values(feedTimings)) {
      if (feed.state === "loading") {
        feed.durationMs = performance.now() - feed.startedAt;
        feed.state = "partial";
      }
    }
    clearInterval(loadTimer);
    loading = false;
    document.querySelectorAll(".story-list").forEach((list) => list.setAttribute("aria-busy", "false"));
    if (snapshot) render();
    else renderStatuses();
  }
}
const layoutObserver = new ResizeObserver(updateStoryVisibility);
layoutObserver.observe(requiredElement("#stringer-news"));
window.addEventListener("resize", updateStoryVisibility);
document.fonts.ready.then(updateStoryVisibility);
setInterval(() => {
  renderStatuses();
  if (!document.hidden && Date.now() - lastAttempt >= interval) load();
}, 3e4);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - lastAttempt >= interval) load();
});
load();
export {
  castImageVote,
  connectNostr,
  detectNostr,
  findCommons,
  imageOptions,
  imageReview,
  loadSuggestions,
  publishCommons,
  renderWorld,
  skipImage,
  syncImages,
  undoImage
};
