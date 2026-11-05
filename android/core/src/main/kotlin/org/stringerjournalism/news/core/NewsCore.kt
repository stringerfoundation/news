package org.stringerjournalism.news.core

import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import okhttp3.OkHttpClient
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

class NewsCore(
    catalogueJson: String,
    private val cache: SnapshotCache = InMemorySnapshotCache(),
    client: OkHttpClient = RelayTransport.defaultClient(),
) {
    val catalogue: CoreCatalogue = CatalogueParser.parse(catalogueJson)
    private val transport = RelayTransport(client)
    private val json = Json
    private val trustedAtomstrSources = catalogue.editions.values.flatten().map { it.copy(feeds = it.feeds.toList()) }

    suspend fun loadRelaySnapshot(timeoutMs: Long = 15_000, onUpdate: (Snapshot) -> Unit = {}): Snapshot {
        require(timeoutMs in 1..15_000) { "Invalid relay loading budget" }
        val started = System.nanoTime()
        val cached = cachedRelayCollection()
        try {
            val remaining = { timeoutMs - (System.nanoTime() - started) / 1_000_000L }
            val manifestEvents = transport.query(catalogue.relay.relays, buildJsonObject {
                put("kinds", buildJsonArray { add(Protocol.MANIFEST_KIND) })
                put("authors", buildJsonArray { add(catalogue.relay.pubkey) })
                put("#d", buildJsonArray { add(Protocol.MANIFEST_KEY) })
                put("limit", 5)
            }, remaining().coerceAtLeast(0))
            val manifests = manifestEvents.mapNotNull { event ->
                try { Protocol.readManifest(event, catalogue.relay, catalogue) } catch (_: Exception) { null }
            }.sortedWith(compareByDescending<Manifest> { it.generatedAt }.thenBy { it.event.id })
            val manifest = manifests.firstOrNull() ?: error("No valid collection")
            if (cached != null && Protocol.isRollback(cached.snapshot.generatedAt, manifest.generatedAt))
                error("Older collection")

            val articleIds = manifest.sources.values.flatMap { it.ids }
            val assignmentIds = if (manifest.groups.isEmpty()) manifest.assignments.values.toList() else emptyList()
            val requested = (articleIds + assignmentIds).distinct()
            val received = java.util.concurrent.ConcurrentHashMap<String, NostrEvent>()
            val lastProgressAt = java.util.concurrent.atomic.AtomicLong(0)
            val eligibleCached = cached?.events.orEmpty().filter { it.id in requested }
            eligibleCached.forEach { received[it.id] = it }
            fun reportPartial() {
                synchronized(received) {
                    try {
                        val partial = Protocol.assemble(manifest, received.values.toList(), catalogue.relay, catalogue, allowPartial = true)
                        if (partial.stories.isNotEmpty()) onUpdate(partial)
                    } catch (_: Exception) { }
                }
            }
            val missing = requested.filterNot(received::containsKey)
            reportPartial()
            for (batch in missing.chunked(100)) {
                if (remaining() <= 0) break
                val events = transport.query(catalogue.relay.relays, buildJsonObject {
                    put("ids", JsonArray(batch.map(::JsonPrimitive)))
                    put("authors", buildJsonArray { add(catalogue.relay.pubkey) })
                    put("kinds", buildJsonArray { add(1) })
                    put("limit", batch.size)
                }, remaining().coerceAtLeast(0)) { event ->
                    if (event.id in requested) {
                        received[event.id] = event
                        val current = System.nanoTime()
                        val previous = lastProgressAt.get()
                        if (current - previous >= 100_000_000L && lastProgressAt.compareAndSet(previous, current)) reportPartial()
                    }
                }
                events.filter { it.id in requested }.forEach { received[it.id] = it }
                reportPartial()
            }
            val retryMissing = articleIds.filterNot { id -> received[id]?.let { Nostr.verify(it, catalogue.relay.pubkey, 1) } == true }
            if (retryMissing.isNotEmpty() && remaining() > 0) {
                for (batch in retryMissing.chunked(100)) {
                    if (remaining() <= 0) break
                    val events = transport.query(catalogue.relay.relays, buildJsonObject {
                        put("ids", JsonArray(batch.map(::JsonPrimitive)))
                        put("authors", buildJsonArray { add(catalogue.relay.pubkey) })
                        put("kinds", buildJsonArray { add(1) })
                        put("limit", batch.size)
                    }, remaining().coerceAtLeast(0)) { event -> if (event.id in requested) received[event.id] = event }
                    events.filter { it.id in requested }.forEach { received[it.id] = it }
                }
            }
            val result = Protocol.assemble(manifest, received.values, catalogue.relay, catalogue, allowPartial = true)
            writeRelayCollection(manifest.event, received.values)
            return result
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            if (cached != null) return cached.snapshot.copy(status = "failure", error = error.message ?: "Relay refresh unavailable", isStale = true)
            throw error
        }
    }

    fun cachedRelaySnapshot(): Snapshot? = cachedRelayCollection()?.snapshot?.copy(
        status = "failure", error = "Showing the previously verified collection", isStale = true,
    )

    suspend fun loadAtomstrSources(
        sources: List<AtomstrSource>,
        timeoutMs: Long = 8_000,
        onUpdate: (sourceId: String, state: SourceState) -> Unit = { _, _ -> },
    ): Map<String, SourceState> {
        require(timeoutMs in 1..8_000) { "Invalid Atomstr loading budget" }
        val selected = sources.distinctBy { it.id }.take(500)
        val previous = cachedAtomstrSources(selected)
        val permits = Semaphore(8)
        previous.forEach { (id, state) -> try { onUpdate(id, state) } catch (_: Exception) { } }
        return coroutineScope {
            selected.map { source -> async(Dispatchers.IO) { permits.withPermit {
                val attempted = Instant.now().toString()
                val state = try {
                    require(isTrustedSource(source)) { "Unknown Atomstr source" }
                    require(source.id.matches(Regex("^[a-zA-Z0-9_-]{1,80}$")) && source.name.isNotBlank() && source.feeds.isNotEmpty()) { "Invalid Atomstr source" }
                    require(source.feeds.size <= 50 && source.feeds.all { it.pubkey.matches(HEX_64) && safeHttpUrl(it.url) }) { "Invalid Atomstr feed" }
                    val nowMs = System.currentTimeMillis()
                    val events = transport.query(listOf(catalogue.atomstrRelay), buildJsonObject {
                        put("kinds", buildJsonArray { add(1) })
                        put("authors", JsonArray(source.feeds.map { JsonPrimitive(it.pubkey) }.distinct()))
                        put("since", (nowMs - ATOMSTR_MAX_AGE_MS) / 1000)
                        put("limit", 30)
                    }, timeoutMs)
                    val checked = atomstrStories(events, source, nowMs)
                    if (checked.second.isEmpty()) error("No verified Atomstr publications")
                    writeAtomstrCollection(source, attempted, checked.first)
                    SourceState(checked.second, "success", null, attempted, attempted)
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    previous[source.id]?.copy(status = "failure", error = e.message ?: "No verified Atomstr publications", attemptedAt = attempted, pending = null)
                        ?: SourceState(emptyList(), "failure", e.message ?: "No verified Atomstr publications", attempted)
                }
                try { onUpdate(source.id, state) } catch (_: Exception) { }
                source.id to state
            } } }.awaitAll().toMap()
        }
    }

    fun cachedAtomstrSources(sources: List<AtomstrSource>): Map<String, SourceState> = sources.distinctBy { it.id }.associate { source ->
        val now = System.currentTimeMillis()
        val attempted = Instant.ofEpochMilli(now).toString()
        val value = try { cache.read(atomstrKey(source.id))?.takeIf { it.length <= MAX_ATOMSTR_CACHE_CHARS }?.let(json::parseToJsonElement)?.jsonObject } catch (_: Exception) { null }
        val checkedAt = value?.get("checkedAt")?.jsonPrimitive?.contentOrNull
        val checkedMillis = checkedAt?.isoMillisOrNull()
        val rawEvents = value?.get("events")?.jsonArray
        val verified = try {
            require(isTrustedSource(source))
            require(checkedMillis != null && checkedMillis <= now)
            require(rawEvents != null && rawEvents.size <= 30)
            val parsed = rawEvents.mapNotNull { Nostr.parse(it, now) }
            require(parsed.size == rawEvents.size)
            require(parsed.all { event -> source.feeds.any { it.pubkey == event.pubkey } && Nostr.verify(event, event.pubkey, 1, now) })
            atomstrStories(parsed, source, now)
        } catch (_: Exception) { null }
        val state = if (verified != null && verified.second.isNotEmpty())
            SourceState(verified.second, "failure", "Showing previously verified Atomstr publications while checking for updates", attempted, checkedAt)
        else SourceState(emptyList(), "failure", "No verified publications available from the ${source.name} Atomstr mirror", attempted)
        source.id to state
    }

    private fun isTrustedSource(source: AtomstrSource): Boolean = trustedAtomstrSources.any {
        it.id == source.id && it.name == source.name && it.feeds == source.feeds &&
            (source.homepage == null || it.homepage == source.homepage)
    }

    private fun atomstrStories(events: List<NostrEvent>, source: AtomstrSource, now: Long): Pair<List<NostrEvent>, List<Story>> {
        val valid = events.mapNotNull { event -> parseAtomstrEvent(event, source, now)?.let { event to it } }
        val candidates = if (valid.any { it.second.mirroredVia == null }) valid.filter { it.second.mirroredVia == null } else valid
        val stories = Protocol.deduplicate(candidates.map { it.second }).sortedByDescending { it.publishedAt ?: "" }.take(30)
        val ids = stories.map { it.id }.toSet()
        return candidates.filter { it.first.id in ids }.map { it.first } to stories
    }

    internal fun parseAtomstrEvent(event: NostrEvent, source: AtomstrSource, now: Long): Story? = try {
        require(event.kind == 1 && event.content.length <= 50_000 && event.tags.size <= 256 && event.createdAt > 0 && event.createdAt * 1000 <= now + 60_000)
        val feed = source.feeds.firstOrNull { it.pubkey == event.pubkey } ?: error("Unpinned Atomstr author")
        require(Nostr.verify(event, feed.pubkey, 1, now))
        val proxies = event.tags.tagValues("proxy")
        require(proxies.size == 1)
        val proxy = proxies.single()
        val provenance = proxy.getOrNull(1) ?: error("Missing provenance")
        require(proxy.getOrNull(2) == "rss" && provenance.startsWith(feed.url + "#"))
        val sourceUrl = decodeProvenanceUrl(feed.url, provenance) ?: error("Invalid provenance URL")
        val headline = event.content.substringBefore('\n').trim()
        require(headline.isNotEmpty() && headline.length <= 1000)
        Story(event.id, headline, sourceUrl, source.name, Instant.ofEpochSecond(event.createdAt).toString(), "", null, sourceId = source.id, mirroredVia = feed.social, atomstr = true)
    } catch (_: Exception) { null }

    private fun cachedRelayCollection(): CachedRelay? {
        val raw = try { cache.read(relayKey()) } catch (_: Exception) { null } ?: return null
        if (raw.length > MAX_RELAY_CACHE_CHARS) return null
        return try {
            val obj = json.parseToJsonElement(raw).jsonObject
            val manifest = Nostr.parse(obj["manifest"] ?: return null) ?: return null
            val eventsEl = obj["stories"]?.jsonArray ?: return null
            if (eventsEl.size > MAX_CACHE_EVENTS) return null
            val events = eventsEl.mapNotNull { Nostr.parse(it) }
            if (events.size != eventsEl.size) return null
            if (events.any { !Nostr.verify(it, catalogue.relay.pubkey, 1) }) return null
            val checked = Protocol.readManifest(manifest, catalogue.relay, catalogue)
            val snapshot = Protocol.assemble(checked, events, catalogue.relay, catalogue, allowPartial = true)
            CachedRelay(manifest, events, snapshot)
        } catch (_: Exception) { null }
    }

    private fun writeRelayCollection(manifest: NostrEvent, events: Collection<NostrEvent>) {
        if (events.size > MAX_CACHE_EVENTS) return
        try {
            cache.write(relayKey(), buildJsonObject {
                put("manifest", manifest.asJson())
                put("stories", JsonArray(events.distinctBy { it.id }.map { it.asJson() }))
            }.toString())
        } catch (_: Exception) { }
    }

    private fun writeAtomstrCollection(source: AtomstrSource, checkedAt: String, events: List<NostrEvent>) {
        if (events.size > 30) return
        try { cache.write(atomstrKey(source.id), buildJsonObject {
            put("checkedAt", checkedAt); put("events", JsonArray(events.map { it.asJson() }))
        }.toString()) } catch (_: Exception) { }
    }

    private fun relayKey() = "stringer-relay:${catalogue.relay.pubkey}"
    private fun atomstrKey(id: String) = "stringer-atomstr-v1:$id"
    private data class CachedRelay(val manifest: NostrEvent, val events: List<NostrEvent>, val snapshot: Snapshot)

    companion object {
        const val ATOMSTR_MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000
        const val MAX_CACHE_EVENTS = 700
        const val MAX_RELAY_CACHE_CHARS = 5_000_000
        const val MAX_ATOMSTR_CACHE_CHARS = 1_000_000
    }
}

internal fun decodeProvenanceUrl(feedUrl: String, provenance: String): String? {
    return try {
        if (!provenance.startsWith("$feedUrl#")) return null
        URLDecoder.decode(provenance.substring(feedUrl.length + 1).replace("+", "%2B"), StandardCharsets.UTF_8.name())
            .takeIf(::safeHttpUrl)
    } catch (_: Exception) { null }
}
