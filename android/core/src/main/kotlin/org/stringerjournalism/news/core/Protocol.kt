package org.stringerjournalism.news.core

import kotlinx.serialization.json.*
import java.net.URI
import java.time.Instant

internal data class ManifestSource(
    val ids: List<String>, val attemptedAt: String, val lastSuccessAt: String?,
    val status: String, val error: String?, val pending: Int?,
)
internal data class Manifest(
    val event: NostrEvent, val generatedAt: String, val sources: Map<String, ManifestSource>,
    val groups: Map<String, String>, val assignments: Map<String, String>,
)

internal object Protocol {
    const val MANIFEST_KIND = 30078
    const val MANIFEST_KEY = "stringer-news-v1"
    const val GROUP_MARKER = "stringer-group-v1"
    private val json = Json

    fun readManifest(event: NostrEvent, config: RelayConfig, catalogue: CoreCatalogue, now: Long = System.currentTimeMillis()): Manifest {
        require(Nostr.verify(event, config.pubkey, MANIFEST_KIND, now)) { "Invalid manifest signature" }
        val dTags = event.tags.tagValues("d")
        require(dTags.size == 1 && dTags.single().getOrNull(1) == MANIFEST_KEY) { "Invalid manifest tag" }
        require(event.content.length <= 300_000) { "Manifest exceeds size limit" }
        val obj = json.parseToJsonElement(event.content).jsonObject
        require(obj["version"]?.jsonPrimitive?.intOrNull == 1) { "Invalid manifest version" }
        val generatedAt = obj["generatedAt"]?.jsonPrimitive?.content ?: error("Missing collection time")
        val generatedMillis = generatedAt.isoMillisOrNull() ?: error("Invalid collection time")
        require(generatedMillis <= now + 60_000) { "Future collection" }
        val rawSources = obj["sources"]?.jsonObject ?: error("Missing source records")
        val expectedSources = catalogue.englishSources.keys + "stringer"
        require(rawSources.keys.all { it in expectedSources } && expectedSources.all { it in rawSources || it == "cna" }) {
            "Unexpected source set"
        }
        val entries = expectedSources.associateWith { source ->
            val raw = rawSources[source]?.jsonObject ?: run {
                require(source == "cna") { "Missing $source source" }
                buildJsonObject {
                    put("ids", buildJsonArray {})
                    put("attemptedAt", generatedAt)
                    put("lastSuccessAt", JsonNull)
                    put("status", "failure")
                    put("error", "CNA is not available in this collection")
                }
            }
            val ids = raw["ids"]?.jsonArray?.map { it.jsonPrimitive.content } ?: error("Invalid story references")
            val maxIds = if (source == "stringer") 200 else 30
            require(ids.size <= maxIds && ids.distinct().size == ids.size && ids.all { it.matches(HEX_64) }) { "Invalid story references" }
            val attempted = raw["attemptedAt"]?.jsonPrimitive?.content ?: error("Missing attempt time")
            val attemptedMs = attempted.isoMillisOrNull() ?: error("Invalid attempt time")
            val last = raw["lastSuccessAt"]?.jsonPrimitive?.contentOrNull
            val lastMs = last?.isoMillisOrNull()
            val status = raw["status"]?.jsonPrimitive?.content ?: error("Missing source status")
            val error = raw["error"]?.jsonPrimitive?.contentOrNull
            val pendingElement = raw["pending"]
            val pending = pendingElement?.jsonPrimitive?.intOrNull
            require(attemptedMs <= generatedMillis && (last == null || (lastMs != null && lastMs <= attemptedMs))) { "Invalid source chronology" }
            require(status in setOf("success", "failure", "paused")) { "Invalid source status" }
            require((status != "success" || (last == attempted && error == null)) &&
                (status != "failure" || !error.isNullOrBlank()) &&
                (status != "paused" || (ids.isEmpty() && last == null && error == null))) { "Invalid source metadata" }
            require(ids.isEmpty() || last != null) { "Stories lack successful collection time" }
            require(source != "stringer" || last == null || ids.isNotEmpty()) { "Invalid Stringer baseline" }
            require(pendingElement == null || pending != null) { "Invalid pending count" }
            require(pending == null || pending in 0..200) { "Invalid pending count" }
            ManifestSource(ids, attempted, last, status, error, pending)
        }
        val allIds = entries.values.flatMap { it.ids }.toSet()
        val publisherIds = entries.filterKeys { it != "stringer" }.values.flatMap { it.ids }.toSet()
        val groups = filteredMap(obj["groups"], publisherIds)
        val assignments = filteredMap(obj["assignments"], allIds)
        return Manifest(event, generatedAt, entries, groups, assignments)
    }

    fun isRollback(cachedGeneratedAt: String?, incomingGeneratedAt: String): Boolean =
        (cachedGeneratedAt?.isoMillisOrNull() ?: Long.MIN_VALUE) > (incomingGeneratedAt.isoMillisOrNull() ?: Long.MIN_VALUE)

    private fun filteredMap(value: JsonElement?, validKeys: Set<String>): Map<String, String> {
        val raw = try { value?.jsonObject } catch (_: Exception) { null } ?: return emptyMap()
        return raw.mapNotNull { (key, item) ->
            try {
                val v = item.jsonPrimitive.content
                if (key in validKeys && v.matches(HEX_64)) key to v else null
            } catch (_: Exception) { null }
        }.toMap()
    }

    fun assemble(manifest: Manifest, events: Collection<NostrEvent>, config: RelayConfig, catalogue: CoreCatalogue, allowPartial: Boolean, now: Long = System.currentTimeMillis()): Snapshot {
        val byId = events.associateBy { it.id }
        val expected = manifest.sources.values.flatMap { it.ids }.toSet()
        val out = linkedMapOf<String, SourceState>()
        for ((sourceId, entry) in manifest.sources) {
            val missing = entry.ids.count { it !in byId }
            require(allowPartial || missing == 0) { "Incomplete relay collection" }
            val stories = entry.ids.mapNotNull { id ->
                val event = byId[id] ?: return@mapNotNull null
                val cluster = if (sourceId == "stringer") null else manifest.groups[id]
                    ?: manifest.assignments[id]?.let { replyId -> byId[replyId]?.let { readAssignment(it, id, config, now) } }
                parseRelayStory(event, sourceId, config, catalogue, now, cluster)
            }
            require(stories.size == entry.ids.size - missing) { "Invalid story event" }
            val stateStatus = if (sourceId == "stringer" && missing > 0 && stories.isEmpty()) "failure" else if (missing > 0) "partial" else entry.status
            val stateError = if (sourceId == "stringer" && missing > 0 && stories.isEmpty()) "Published stories temporarily unavailable from relays" else entry.error
            out[sourceId] = SourceState(
                stories = stories,
                status = stateStatus,
                error = stateError,
                attemptedAt = entry.attemptedAt,
                updatedAt = entry.lastSuccessAt,
                pending = entry.pending ?: missing.takeIf { it > 0 },
            )
        }
        require(out.values.any { it.stories.isNotEmpty() } || expected.isEmpty()) { "No published stories available" }
        val unique = deduplicate(out.values.flatMap { it.stories })
        val stale = out.values.any { it.status == "partial" || it.status == "failure" }
        return Snapshot(unique, if (stale) "partial" else "success", if (stale) "Some sources could not be refreshed" else null,
            manifest.generatedAt, manifest.generatedAt, out, stale)
    }

    private fun parseRelayStory(event: NostrEvent, sourceId: String, config: RelayConfig, catalogue: CoreCatalogue, now: Long, cluster: String?): Story {
        require(Nostr.verify(event, config.pubkey, 1, now)) { "Invalid article signature" }
        val tags = event.tags.tagValues("stringer")
        require(tags.size == 1 && tags.single().getOrNull(1) == sourceId) { "Invalid story source tag" }
        val storyJson = tags.single().getOrNull(2) ?: error("Missing story payload")
        require(storyJson.length <= 100_000) { "Story payload too large" }
        val obj = json.parseToJsonElement(storyJson).jsonObject
        val title = stringField(obj["title"])?.trim() ?: error("Missing headline")
        val url = stringField(obj["url"]) ?: error("Missing story URL")
        require(title.isNotEmpty() && title.length <= 1000 && safeHttpUrl(url)) { "Invalid story content" }
        require(event.tags.tagValues("r").any { it.getOrNull(1) == url }) { "Story URL mismatch" }
        val permission = catalogue.permissions[sourceId] ?: ContentPermission(text = false, summaries = false, images = false)
        require(permission.text) { "Source content is not permitted" }
        val rawSummary = stringField(obj["summary"]) ?: error("Missing story summary")
        val summary = if (permission.summaries) rawSummary.take(20_000) else ""
        validateImage(obj["image"])
        val publishedAt = nullableStringField(obj["publishedAt"])
        require(publishedAt == null || publishedAt.isoMillisOrNull() != null) { "Invalid publication time" }
        val publicationDate = nullableStringField(obj["publicationDate"])
        require(publicationDate == null || isIsoDate(publicationDate)) { "Invalid publication date" }
        val publicationSource = nullableStringField(obj["publicationSource"])
        require(publicationSource == null || publicationSource == url) { "Invalid publication source" }
        val credits = if (sourceId == "stringer") stringField(obj["credits"])?.takeIf { it.isNotBlank() } else null
        require(sourceId != "stringer" || (!summary.isNullOrBlank() && !credits.isNullOrBlank())) { "Invalid Stringer story" }
        val sourceName = catalogue.englishSources[sourceId] ?: sourceId
        return Story(event.id, title, url, sourceName, publishedAt, summary, credits, publicationDate, publicationSource, sourceId, atomstr = false, clusterId = cluster)
    }

    private fun readAssignment(event: NostrEvent, noteId: String, config: RelayConfig, now: Long): String? {
        return try {
            require(Nostr.verify(event, config.pubkey, 1, now))
            val marker = event.tags.tagValues(GROUP_MARKER)
            val roots = event.tags.tagValues("e")
            val cluster = marker.singleOrNull()?.getOrNull(1) ?: return null
            require(cluster.matches(HEX_64) && roots.size == 1 && roots.single().getOrNull(1) == noteId && roots.single().getOrNull(3) == "root")
            require(event.tags.any { it.getOrNull(0) == "t" && it.getOrNull(1) == "stringer-event-${cluster.take(16)}" })
            cluster
        } catch (_: Exception) { null }
    }

    private fun isIsoDate(value: String): Boolean = try {
        value.matches(Regex("^\\d{4}-\\d{2}-\\d{2}$")) && java.time.LocalDate.parse(value).toString() == value
    } catch (_: Exception) { false }

    private fun stringField(value: JsonElement?): String? = (value as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun nullableStringField(value: JsonElement?): String? = when (value) {
        null, JsonNull -> null
        else -> stringField(value) ?: error("Invalid string field")
    }

    private fun validateImage(value: JsonElement?) {
        if (value == null || value == JsonNull) return
        val obj = value.jsonObject
        val url = stringField(obj["url"]) ?: error("Invalid image URL")
        val alt = stringField(obj["alt"]) ?: error("Invalid image alt text")
        val credit = stringField(obj["credit"]) ?: error("Invalid image credit")
        require(safeHttpUrl(url) && URI(url).scheme.equals("https", ignoreCase = true) && alt.length <= 5000 && credit.length <= 5000) {
            "Invalid story image"
        }
    }

    fun deduplicate(stories: List<Story>): List<Story> {
        val seen = mutableSetOf<String>()
        return stories.filter { story ->
            val uri = URI(story.url).normalize()
            val scheme = uri.scheme.lowercase()
            val port = if ((scheme == "https" && uri.port == 443) || (scheme == "http" && uri.port == 80)) -1 else uri.port
            val key = URI(scheme, null, uri.host.lowercase(), port, uri.path.ifEmpty { "/" }, uri.query, null).toASCIIString()
            seen.add(key)
        }
    }
}
