package org.stringerjournalism.news.core

import kotlinx.serialization.Serializable

@Serializable
data class RelayConfig(val pubkey: String, val relays: List<String>)

@Serializable
data class AtomstrFeed(val url: String, val pubkey: String, val social: String? = null)

@Serializable
data class AtomstrSource(val id: String, val name: String, val feeds: List<AtomstrFeed>, val homepage: String? = null)

@Serializable
data class Story(
    val id: String,
    val title: String,
    val url: String,
    val publisher: String,
    val publishedAt: String? = null,
    val summary: String = "",
    val attribution: String? = null,
    val publicationDate: String? = null,
    val publicationSource: String? = null,
    val sourceId: String,
    val mirroredVia: String? = null,
    val atomstr: Boolean = false,
    val clusterId: String? = null,
)

@Serializable
data class SourceState(
    val stories: List<Story> = emptyList(),
    val status: String,
    val error: String? = null,
    val attemptedAt: String,
    val updatedAt: String? = null,
    val pending: Int? = null,
)

@Serializable
data class Snapshot(
    val stories: List<Story>,
    val status: String,
    val error: String? = null,
    val updatedAt: String? = null,
    val generatedAt: String? = null,
    val sources: Map<String, SourceState> = emptyMap(),
    val isStale: Boolean = false,
)

/** Stores only signed event envelopes. The core revalidates every entry after reads. */
interface SnapshotCache {
    fun read(key: String): String?
    fun write(key: String, value: String)
}

class InMemorySnapshotCache : SnapshotCache {
    private val values = mutableMapOf<String, String>()
    @Synchronized override fun read(key: String): String? = values[key]
    @Synchronized override fun write(key: String, value: String) { values[key] = value }
}

data class CoreCatalogue(
    val relay: RelayConfig,
    val atomstrRelay: String,
    val editions: Map<String, List<AtomstrSource>>,
    val englishSources: Map<String, String>,
    val permissions: Map<String, ContentPermission>,
)

data class ContentPermission(val text: Boolean, val summaries: Boolean, val images: Boolean)
