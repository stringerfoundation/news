package org.stringerjournalism.news.core

import kotlinx.coroutines.*
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.*
import okhttp3.*
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.resume

internal class RelayTransport(private val client: OkHttpClient) {
    suspend fun query(relays: List<String>, filter: JsonObject, timeoutMs: Long, onEvent: (NostrEvent) -> Unit = {}): List<NostrEvent> {
        if (timeoutMs <= 0) return emptyList()
        val found = java.util.concurrent.ConcurrentHashMap<String, NostrEvent>()
        val requestedLimit = filter["limit"]?.jsonPrimitive?.intOrNull ?: 100
        val maxEvents = (requestedLimit.coerceIn(1, MAX_ACCEPTED_EVENTS) * relays.size).coerceAtMost(MAX_ACCEPTED_EVENTS)
        coroutineScope {
            relays.map { relay -> async(Dispatchers.IO) {
                try {
                    withTimeout(minOf(timeoutMs, RELAY_QUERY_CEILING_MS)) {
                        queryOne(relay, filter) { event ->
                            synchronized(found) {
                                if (found.size < maxEvents && matches(event, filter) && found.putIfAbsent(event.id, event) == null) onEvent(event)
                            }
                        }
                    }
                } catch (_: TimeoutCancellationException) { /* a silent relay does not cancel healthy peers */ }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { /* other relays remain useful */ }
            } }.awaitAll()
        }
        return found.values.toList()
    }

    private fun matches(event: NostrEvent, filter: JsonObject): Boolean {
        filter["kinds"]?.jsonArray?.let { if (it.none { kind -> kind.jsonPrimitive.intOrNull == event.kind }) return false }
        filter["authors"]?.jsonArray?.let { authors -> if (authors.none { event.pubkey.startsWith(it.jsonPrimitive.content) }) return false }
        filter["ids"]?.jsonArray?.let { ids -> if (ids.none { event.id.startsWith(it.jsonPrimitive.content) }) return false }
        filter["since"]?.jsonPrimitive?.longOrNull?.let { if (event.createdAt < it) return false }
        filter["until"]?.jsonPrimitive?.longOrNull?.let { if (event.createdAt > it) return false }
        filter["#d"]?.jsonArray?.let { values ->
            val valuesOnEvent = event.tags.tagValues("d").mapNotNull { it.getOrNull(1) }
            if (values.none { it.jsonPrimitive.content in valuesOnEvent }) return false
        }
        return true
    }

    private suspend fun queryOne(relay: String, filter: JsonObject, onEvent: (NostrEvent) -> Unit) {
        require(safeWebSocketUrl(relay)) { "Invalid relay URL" }
        suspendCancellableCoroutine<Unit> { continuation ->
            val subscriptionId = UUID.randomUUID().toString().replace("-", "").take(16)
            var socket: WebSocket? = null
            val bytesSeen = AtomicLong(0)
            val messagesSeen = AtomicInteger(0)
            val listener = object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    socket = webSocket
                    val req = buildJsonArray { add("REQ"); add(subscriptionId); add(filter) }.toString()
                    if (!webSocket.send(req) && continuation.isActive) {
                        webSocket.cancel()
                        continuation.resume(Unit)
                    }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (text.length > MAX_EVENT_BYTES) {
                        webSocket.cancel()
                        if (continuation.isActive) continuation.resume(Unit)
                        return
                    }
                    val received = text.toByteArray(Charsets.UTF_8).size
                    if (received > MAX_EVENT_BYTES || bytesSeen.addAndGet(received.toLong()) > MAX_QUERY_BYTES || messagesSeen.incrementAndGet() > MAX_QUERY_MESSAGES) {
                        webSocket.cancel()
                        if (continuation.isActive) continuation.resume(Unit)
                        return
                    }
                    try {
                        val frame = Json.parseToJsonElement(text).jsonArray
                        when (frame.getOrNull(0)?.jsonPrimitive?.content) {
                            "EVENT" -> if (frame.getOrNull(1)?.jsonPrimitive?.content == subscriptionId) {
                                Nostr.parse(frame.getOrNull(2) ?: return)?.let(onEvent)
                            }
                            "EOSE", "CLOSED" -> if (frame.getOrNull(1)?.jsonPrimitive?.content == subscriptionId) {
                                webSocket.send(buildJsonArray { add("CLOSE"); add(subscriptionId) }.toString())
                                if (continuation.isActive) {
                                    webSocket.close(1000, "query complete")
                                    continuation.resume(Unit)
                                }
                            }
                            "NOTICE" -> Unit
                        }
                    } catch (_: Exception) { /* malformed frames are ignored */ }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    if (continuation.isActive) continuation.resume(Unit)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    if (continuation.isActive) continuation.resume(Unit)
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, reason)
                    if (continuation.isActive) continuation.resume(Unit)
                }
            }
            socket = client.newWebSocket(Request.Builder().url(relay).build(), listener)
            continuation.invokeOnCancellation { socket?.cancel() }
        }
    }

    companion object {
        const val RELAY_QUERY_CEILING_MS = 6_000L
        const val MAX_EVENT_BYTES = 500_000
        const val MAX_QUERY_BYTES = 8_000_000L
        const val MAX_QUERY_MESSAGES = 1_000
        const val MAX_ACCEPTED_EVENTS = 700
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(8, TimeUnit.SECONDS)
            .writeTimeout(4, TimeUnit.SECONDS)
            .callTimeout(10, TimeUnit.SECONDS)
            .build()
    }
}
