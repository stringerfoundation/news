package org.stringerjournalism.news.core

import fr.acinq.secp256k1.Secp256k1
import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.time.Instant

internal data class NostrEvent(
    val id: String,
    val pubkey: String,
    val createdAt: Long,
    val kind: Int,
    val tags: List<List<String>>,
    val content: String,
    val sig: String,
) {
    fun asJson(): JsonObject = buildJsonObject {
        put("id", id); put("pubkey", pubkey); put("created_at", createdAt)
        put("kind", kind)
        put("tags", JsonArray(tags.map { JsonArray(it.map(::JsonPrimitive)) }))
        put("content", content); put("sig", sig)
    }
}

internal object Nostr {
    private val json = Json
    private val secp by lazy { Secp256k1.get() }

    fun parse(value: JsonElement, nowMs: Long = System.currentTimeMillis()): NostrEvent? {
        return try {
        if (json.encodeToString(JsonElement.serializer(), value).length > 500_000) return null
        val obj = value.jsonObject
        val id = obj["id"]?.jsonPrimitive?.takeIf { it.isString }?.content ?: return null
        val pubkey = obj["pubkey"]?.jsonPrimitive?.takeIf { it.isString }?.content ?: return null
        val created = obj["created_at"]?.jsonPrimitive?.takeIf { !it.isString }?.longOrNull ?: return null
        val kind = obj["kind"]?.jsonPrimitive?.takeIf { !it.isString }?.intOrNull ?: return null
        val tagsEl = obj["tags"]?.jsonArray ?: return null
        if (!id.matches(HEX_64) || !pubkey.matches(HEX_64) || created <= 0 || created > nowMs / 1000 + 60 ||
            kind !in 0..65535 || tagsEl.size > 256) return null
        val tags = tagsEl.map { el ->
            val row = el.jsonArray
            if (row.size > 64) return null
            row.map { it.jsonPrimitive.takeIf(JsonPrimitive::isString)?.content?.also { value -> if (value.length > 10_000) return null } ?: return null }
        }
        val content = obj["content"]?.jsonPrimitive?.takeIf { it.isString }?.content ?: return null
        val sig = obj["sig"]?.jsonPrimitive?.takeIf { it.isString }?.content ?: return null
        if (content.length > 500_000 || !sig.matches(Regex("^[0-9a-f]{128}$"))) return null
        val event = NostrEvent(id, pubkey, created, kind, tags, content, sig)
        if (json.encodeToString(JsonElement.serializer(), event.asJson()).length > 500_000) return null
        event
        } catch (_: Exception) { null }
    }

    fun verify(event: NostrEvent, expectedPubkey: String? = null, expectedKind: Int? = null, nowMs: Long = System.currentTimeMillis()): Boolean {
        return try {
        if (!event.pubkey.matches(HEX_64) || !event.id.matches(HEX_64) || !event.sig.matches(Regex("^[0-9a-f]{128}$")) ||
            event.createdAt > nowMs / 1000 + 60 || (expectedPubkey != null && event.pubkey != expectedPubkey) ||
            (expectedKind != null && event.kind != expectedKind) || json.encodeToString(JsonElement.serializer(), event.asJson()).length > 500_000) return false
        val canonical = buildJsonArray {
            add(JsonPrimitive(0)); add(JsonPrimitive(event.pubkey)); add(JsonPrimitive(event.createdAt));
            add(JsonPrimitive(event.kind)); add(JsonArray(event.tags.map { JsonArray(it.map(::JsonPrimitive)) }));
            add(JsonPrimitive(event.content))
        }
        val digest = MessageDigest.getInstance("SHA-256").digest(json.encodeToString(JsonElement.serializer(), canonical).toByteArray(Charsets.UTF_8))
        val id = digest.toHex()
        if (!MessageDigest.isEqual(id.hexToBytes(), event.id.hexToBytes())) return false
        secp.verifySchnorr(event.sig.hexToBytes(), digest, event.pubkey.hexToBytes())
        } catch (_: Exception) { false }
    }
}

internal fun List<List<String>>.tagValues(name: String): List<List<String>> = filter { it.firstOrNull() == name }
internal fun String.isoMillisOrNull(): Long? = try { Instant.parse(this).toEpochMilli() } catch (_: Exception) { null }
internal fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
internal fun String.hexToBytes(): ByteArray = chunked(2).map { it.toInt(16).toByte() }.toByteArray()
