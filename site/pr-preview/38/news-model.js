const SOURCES = Object.freeze([
  { id: "bbc", homepage: "https://www.bbc.com/news", linkLabel: "BBC News", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { id: "nyt", homepage: "https://www.nytimes.com/section/world", linkLabel: "The New York Times", name: "NYT World", mayRequireSubscription: true, url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { id: "aljazeera", homepage: "https://www.aljazeera.com/", linkLabel: "Al Jazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { id: "dw", homepage: "https://www.dw.com/", linkLabel: "DW", name: "DW", url: "https://rss.dw.com/rdf/rss-en-all" },
  { id: "cna", homepage: "https://www.channelnewsasia.com/world", linkLabel: "CNA", name: "CNA", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311" },
  { id: "stringer", homepage: "https://stringerjournalism.org/courageous-stories", linkLabel: "Stringer", name: "Stringer", url: "https://stringerjournalism.org/courageous-stories" }
]);
const ARTICLE_IMAGE_HOSTS = Object.freeze({
  bbc: ["www.bbc.com", "www.bbc.co.uk"],
  nyt: ["www.nytimes.com"],
  aljazeera: ["www.aljazeera.com"],
  dw: ["www.dw.com"]
});
const CONTENT_PERMISSIONS = Object.freeze(Object.fromEntries(SOURCES.map((source) => [
  source.id,
  Object.freeze({ text: true, summaries: source.id === "stringer", images: source.id === "stringer" })
])));
function permittedStories(sourceId, stories, permissions = CONTENT_PERMISSIONS) {
  const permission = permissions[sourceId];
  if (permission?.text !== true) return [];
  return stories.map((story) => ({
    title: story.title,
    url: story.url,
    publishedAt: story.publishedAt,
    summary: permission.summaries === true ? story.summary : "",
    ...sourceId === "stringer" ? { credits: story.credits, publicationDate: story.publicationDate ?? null, publicationSource: story.publicationSource ?? null } : {},
    headlineOnly: sourceId !== "stringer" && permission.summaries !== true,
    image: permission.images === true ? story.image ?? null : null
  }));
}
function applyContentPermissions(snapshot, permissions = CONTENT_PERMISSIONS) {
  const sources = normalizeSourceSet(snapshot.sources, snapshot.generatedAt);
  return { ...snapshot, sources: Object.fromEntries(SOURCES.map((source) => {
    const entry = sources[source.id];
    return [source.id, permissions[source.id]?.text === true ? { ...entry, stories: permittedStories(source.id, entry.stories, permissions) } : { ...entry, stories: [], status: "paused", lastSuccessAt: null, error: null }];
  })) };
}
const NEWSWIRE_LIMIT = 30;
const STALE_MS = 2 * 60 * 60 * 1e3;
function safeUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function safeImageUrl(value) {
  const url = safeUrl(value);
  return url && new URL(url).protocol === "https:" ? url : null;
}
function urlIdentity(value) {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}
function newestFirst(a, b) {
  return (b.publishedAt ? Date.parse(b.publishedAt) : -Infinity) - (a.publishedAt ? Date.parse(a.publishedAt) : -Infinity) || 0;
}
function uniqueStories(stories) {
  const seen = /* @__PURE__ */ new Set();
  return stories.filter((story) => {
    const key = urlIdentity(story.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function worldStories(snapshot, selectedSources = SOURCES.map((source) => source.id)) {
  return uniqueStories(SOURCES.filter((s) => s.id !== "stringer" && selectedSources.includes(s.id)).flatMap((source) => snapshot.sources[source.id].stories.map((story) => ({ ...story, source: source.name, mayRequireSubscription: source.mayRequireSubscription === true }))).sort(newestFirst));
}
function worldGroups(snapshot, selectedSources) {
  const groups = /* @__PURE__ */ new Map();
  const chronological = (a, b) => newestFirst(a, b) || (a.noteId || a.url).localeCompare(b.noteId || b.url);
  for (const story of worldStories(snapshot, selectedSources)) {
    const key = story.clusterId || story.noteId || story.url;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(story);
  }
  return [...groups.values()].map((articles) => {
    const newest = [...articles].sort(chronological)[0];
    articles.sort((a, b) => Number(a.mayRequireSubscription) - Number(b.mayRequireSubscription) || chronological(a, b));
    return { ...articles[0], articles, publishedAt: newest.publishedAt, sortId: newest.noteId || newest.url };
  }).sort((a, b) => newestFirst(a, b) || a.sortId.localeCompare(b.sortId));
}
const nonempty = (value) => typeof value === "string" && !!value.trim();
const timestamp = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
function normalizeSourceSet(sources, generatedAt, relay = false) {
  if (!sources || typeof sources !== "object" || Array.isArray(sources) || Object.keys(sources).some((id) => !SOURCES.some((source) => source.id === id)) || SOURCES.some((source) => source.id !== "cna" && !Object.hasOwn(sources, source.id))) {
    throw new Error("Invalid source set");
  }
  if (Object.hasOwn(sources, "cna")) return sources;
  return { ...sources, cna: {
    ...relay ? { ids: [] } : { stories: [] },
    attemptedAt: generatedAt,
    lastSuccessAt: null,
    status: "failure",
    error: "CNA is not available in this collection"
  } };
}
function validateSnapshot(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid news snapshot");
  let value = input;
  if (!value || ![1, 2].includes(value.schemaVersion) || !timestamp(value.generatedAt) || !value.sources) throw new Error("Invalid news snapshot");
  const sources = normalizeSourceSet(value.sources, value.generatedAt);
  if (sources !== value.sources) value = { ...value, sources };
  for (const source of SOURCES) {
    const entry = value.sources[source.id];
    if (!entry || !Array.isArray(entry.stories) || !timestamp(entry.attemptedAt) || !["success", "failure", "paused"].includes(entry.status) || !(entry.lastSuccessAt === null || timestamp(entry.lastSuccessAt))) throw new Error(`Invalid ${source.id} metadata`);
    if (Date.parse(entry.attemptedAt) > Date.parse(value.generatedAt) || entry.lastSuccessAt && Date.parse(entry.lastSuccessAt) > Date.parse(entry.attemptedAt)) throw new Error("Invalid collection chronology");
    if (entry.status === "paused" && (entry.stories.length || entry.lastSuccessAt !== null || entry.error !== null)) throw new Error("Invalid paused source");
    if (entry.status === "success" && (entry.lastSuccessAt !== entry.attemptedAt || entry.error !== null)) throw new Error("Invalid successful collection");
    if (entry.status === "failure" && !nonempty(entry.error)) throw new Error("Missing failure details");
    if (entry.stories.length && !entry.lastSuccessAt) throw new Error("Missing collection time");
    if (source.id === "stringer" && entry.lastSuccessAt && !entry.stories.length) throw new Error("Empty Stringer baseline");
    if (source.id !== "stringer" && entry.stories.length > (value.schemaVersion === 1 ? 5 : NEWSWIRE_LIMIT)) throw new Error("Too many publisher stories");
    for (const story of entry.stories) {
      if (!story || !nonempty(story.title) || !safeUrl(story.url) || typeof story.summary !== "string" || !(story.publishedAt === null || timestamp(story.publishedAt))) throw new Error("Invalid story");
      if (story.publicationDate != null && (!/^\d{4}-\d{2}-\d{2}$/.test(story.publicationDate) || !Number.isFinite(Date.parse(story.publicationDate)) || new Date(story.publicationDate).toISOString().slice(0, 10) !== story.publicationDate)) throw new Error("Invalid publication date");
      if (story.publicationSource != null && story.publicationSource !== story.url) throw new Error("Invalid publication source");
      if (story.image != null && (!safeImageUrl(story.image.url) || typeof story.image.alt !== "string" || typeof story.image.credit !== "string")) throw new Error("Invalid story image");
      if (source.id === "stringer" && (!nonempty(story.credits) || !nonempty(story.summary))) throw new Error("Invalid Stringer story");
    }
  }
  return value;
}
function sourceMessage(source, entry) {
  const last = entry.lastSuccessAt ? formatLocalDateTime(entry.lastSuccessAt) : null;
  const collected = last ? `last collected ${last}` : "No collection available";
  if (entry.status === "failure") return `${source.name}: refresh unavailable. ${collected}`;
  return `${source.name}: ${collected}${entry.stories.length ? "" : ". No published stories in this collection."}`;
}
function formatLocalDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(date);
}
function formatPublicationDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Date unavailable";
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}
export {
  ARTICLE_IMAGE_HOSTS,
  CONTENT_PERMISSIONS,
  NEWSWIRE_LIMIT,
  SOURCES,
  STALE_MS,
  applyContentPermissions,
  formatLocalDateTime,
  formatPublicationDate,
  newestFirst,
  normalizeSourceSet,
  permittedStories,
  safeImageUrl,
  safeUrl,
  sourceMessage,
  uniqueStories,
  urlIdentity,
  validateSnapshot,
  worldGroups,
  worldStories
};
