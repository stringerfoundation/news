import { readResponseText } from "./response.js?v=0bb6a6af4aed6f7d";
import { SOURCES, CONTENT_PERMISSIONS, applyContentPermissions, safeUrl, safeImageUrl, validateSnapshot, worldStories, formatLocalDateTime, formatPublicationDate } from "./news-model.js?v=0bb6a6af4aed6f7d";
import relayConfig from "./relay-config.js?v=0bb6a6af4aed6f7d";
import { STRINGER_MEDIA } from "./stringer-media.js?v=0bb6a6af4aed6f7d";
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
    const imageData = wire ? null : story.image;
    const imageUrl = wire ? null : safeImageUrl(imageData?.url) || localImage;
    if (imageUrl) {
      const figure = element("figure", "", "story-media");
      const image = element("img");
      image.alt = imageData?.alt || "";
      image.width = 240;
      image.height = 240;
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
        const placeholder = element("div", "", "story-placeholder");
        placeholder.setAttribute("aria-hidden", "true");
        image.replaceWith(placeholder);
      });
      image.src = imageUrl;
      figure.append(image);
      if (imageData?.credit) figure.append(element("figcaption", imageData.credit));
      article.classList.add("with-image");
      article.append(figure);
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
  const current = snapshot;
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
      const reader = await import("./relay-reader.js?v=0bb6a6af4aed6f7d");
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
    loadOutcome = "Loaded";
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
