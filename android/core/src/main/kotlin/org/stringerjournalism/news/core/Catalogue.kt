package org.stringerjournalism.news.core

import kotlinx.serialization.json.*

private const val MAX_RELAYS = 5

internal object CatalogueParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun parse(text: String): CoreCatalogue {
        require(text.length <= 2_000_000) { "Catalogue exceeds size limit" }
        val root = json.parseToJsonElement(text).jsonObject
        require(root["schemaVersion"]?.jsonPrimitive?.intOrNull == 1) { "Unsupported catalogue schema" }
        val relay = root["relay"]?.jsonObject ?: error("Missing relay configuration")
        val relayConfig = RelayConfig(
            relay["pubkey"]?.jsonPrimitive?.content ?: error("Missing relay pubkey"),
            relay["relays"]?.jsonArray?.map { it.jsonPrimitive.content } ?: error("Missing relay URLs"),
        )
        val atomstr = root["atomstr"]?.jsonObject ?: error("Missing Atomstr configuration")
        val atomstrRelay = atomstr["relays"]?.jsonArray?.firstOrNull()?.jsonPrimitive?.content
            ?: error("Missing Atomstr relay")

        val editions = root["editions"]?.jsonArray?.associate { item ->
            val obj = item.jsonObject
            val id = obj["id"]?.jsonPrimitive?.content ?: error("Edition has no id")
            val sources = obj["sources"]?.jsonArray?.filter { sourceEl ->
                sourceEl.jsonObject["feeds"] is JsonArray
            }?.map { sourceEl -> json.decodeFromJsonElement<AtomstrSource>(sourceEl) } ?: emptyList()
            id to sources
        } ?: error("Missing editions")

        val englishSources = root["englishSources"]?.jsonArray?.associate { item ->
            val obj = item.jsonObject
            val id = obj["id"]?.jsonPrimitive?.content ?: error("English source has no id")
            id to (obj["name"]?.jsonPrimitive?.content ?: id)
        } ?: error("Missing English sources")

        val permissions = root["contentPermissions"]?.jsonObject?.mapValues { (_, v) ->
            val p = v.jsonObject
            ContentPermission(
                text = p["text"]?.jsonPrimitive?.booleanOrNull == true,
                summaries = p["summaries"]?.jsonPrimitive?.booleanOrNull == true,
                images = p["images"]?.jsonPrimitive?.booleanOrNull == true,
            )
        } ?: emptyMap()
        validateConfig(relayConfig)
        require(atomstrRelay.startsWith("wss://") && safeWebSocketUrl(atomstrRelay)) { "Invalid Atomstr relay" }
        require(editions.values.flatten().size <= 500) { "Too many Atomstr sources" }
        return CoreCatalogue(relayConfig, atomstrRelay, editions, englishSources, permissions)
    }

    private fun validateConfig(config: RelayConfig) {
        require(config.pubkey.matches(HEX_64)) { "Invalid relay public key" }
        require(config.relays.isNotEmpty() && config.relays.size <= MAX_RELAYS) { "Invalid relay count" }
        require(config.relays.distinct().size == config.relays.size) { "Duplicate relay URL" }
        require(config.relays.all(::safeWebSocketUrl)) { "Invalid relay URL" }
    }
}

internal val HEX_64 = Regex("^[0-9a-f]{64}$")

internal fun safeWebSocketUrl(value: String): Boolean = try {
    val uri = java.net.URI(value)
    uri.scheme == "wss" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.fragment == null
} catch (_: Exception) { false }

internal fun safeHttpUrl(value: String): Boolean = try {
    val uri = java.net.URI(value)
    uri.scheme in listOf("https", "http") && !uri.host.isNullOrBlank() && uri.userInfo == null
} catch (_: Exception) { false }
