package org.stringerjournalism.news.core

import kotlinx.serialization.json.*
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import java.io.File
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WebProtocolTest {
    private val fixture by lazy {
        val raw = File(javaClass.getResource("/web-protocol.json")!!.toURI()).readText()
        Json.parseToJsonElement(raw).jsonObject
    }

    private val catalogue by lazy {
        val root = fixture
        val pubkey = root["pubkey"]!!.jsonPrimitive.content
        val names = root["englishSources"]!!.jsonArray.associate {
            val source = it.jsonObject
            source["id"]!!.jsonPrimitive.content to source["name"]!!.jsonPrimitive.content
        }
        val permissions = root["permissions"]!!.jsonObject.mapValues { (_, value) ->
            val p = value.jsonObject
            ContentPermission(p["text"]!!.jsonPrimitive.boolean, p["summaries"]!!.jsonPrimitive.boolean, p["images"]!!.jsonPrimitive.boolean)
        }
        CoreCatalogue(RelayConfig(pubkey, listOf("wss://relay.example")), "wss://atomstr.example", emptyMap(), names, permissions)
    }

    private fun catalogueJson(relayUrl: String = "wss://relay.example"): String = buildJsonObject {
        put("schemaVersion", 1)
        put("relay", buildJsonObject {
            put("pubkey", catalogue.relay.pubkey)
            put("relays", JsonArray(listOf(relayUrl).map(::JsonPrimitive)))
        })
        put("atomstr", buildJsonObject { put("relays", buildJsonArray { add("wss://atomstr.example") }) })
        put("editions", buildJsonArray { add(buildJsonObject {
            put("id", "pt-PT")
            put("sources", buildJsonArray { add(fixture["source"]!!) })
        }) })
        put("englishSources", fixture["englishSources"]!!)
        put("contentPermissions", fixture["permissions"]!!)
    }.toString()

    @Test fun `protocol accepts signed TypeScript fixtures and keeps permissions`() {
        val now = fixture["now"]!!.jsonPrimitive.long
        val batch = fixture["batch"]!!.jsonObject
        val manifestEvent = Nostr.parse(batch["manifest"]!!, now)!!
        assertTrue(Nostr.verify(manifestEvent, catalogue.relay.pubkey, Protocol.MANIFEST_KIND, now))
        val manifest = Protocol.readManifest(manifestEvent, catalogue.relay, catalogue, now)
        val events = batch["events"]!!.jsonArray.map { Nostr.parse(it, now)!! }
        assertTrue(events.all { Nostr.verify(it, catalogue.relay.pubkey, 1, now) })
        val snapshot = Protocol.assemble(manifest, events, catalogue.relay, catalogue, true, now)
        assertEquals(6, snapshot.stories.size)
        assertTrue(snapshot.stories.all { it.summary.isEmpty() || it.sourceId == "stringer" })
        val stringer = snapshot.stories.single { it.sourceId == "stringer" }
        assertEquals("Synthetic reporter", stringer.attribution)
        assertEquals("2026-11-05", stringer.publicationDate)
        assertFalse(snapshot.isStale)
    }

    @Test fun `relay cache inputs reject signature mutation and manifest future time`() {
        val now = fixture["now"]!!.jsonPrimitive.long
        val raw = fixture["batch"]!!.jsonObject["events"]!!.jsonArray.first().jsonObject.toMutableMap()
        raw["content"] = JsonPrimitive("forged")
        val forged = Nostr.parse(JsonObject(raw), now)!!
        assertFalse(Nostr.verify(forged, catalogue.relay.pubkey, 1, now))
        val manifest = fixture["batch"]!!.jsonObject["manifest"]!!.jsonObject.toMutableMap()
        manifest["created_at"] = JsonPrimitive(now / 1000 + 120)
        assertNull(Nostr.parse(JsonObject(manifest), now))
    }

    @Test fun `missing relay notes produce a usable partial snapshot`() {
        val now = fixture["now"]!!.jsonPrimitive.long
        val batch = fixture["batch"]!!.jsonObject
        val manifestEvent = Nostr.parse(batch["manifest"]!!, now)!!
        val manifest = Protocol.readManifest(manifestEvent, catalogue.relay, catalogue, now)
        val events = batch["events"]!!.jsonArray.dropLast(1).map { Nostr.parse(it, now)!! }
        val snapshot = Protocol.assemble(manifest, events, catalogue.relay, catalogue, true, now)
        assertEquals("partial", snapshot.status)
        assertTrue(snapshot.isStale)
        assertEquals(5, snapshot.stories.size)
        assertEquals("failure", snapshot.sources.getValue("stringer").status)
        assertEquals(1, snapshot.sources.getValue("stringer").pending)
    }

    @Test fun `persistent cache roundtrip revalidates relay and Atomstr signatures`() {
        val cache = InMemorySnapshotCache()
        val batch = fixture["batch"]!!.jsonObject
        val manifest = batch["manifest"]!!
        val storyEvents = batch["events"]!!.jsonArray
        cache.write("stringer-relay:${catalogue.relay.pubkey}", buildJsonObject {
            put("manifest", manifest)
            put("stories", storyEvents)
        }.toString())
        val source = Json.decodeFromJsonElement<AtomstrSource>(fixture["source"]!!)
        cache.write("stringer-atomstr-v1:${source.id}", buildJsonObject {
            put("checkedAt", Instant.ofEpochMilli(fixture["now"]!!.jsonPrimitive.long).toString())
            put("events", buildJsonArray { add(fixture["atomstr"]!!) })
        }.toString())
        val core = NewsCore(catalogueJson(), cache)
        val relaySnapshot = core.cachedRelaySnapshot()
        assertNotNull(relaySnapshot)
        assertTrue(relaySnapshot.isStale)
        assertEquals(6, relaySnapshot.stories.size)
        val mirror = core.cachedAtomstrSources(listOf(source)).getValue(source.id)
        assertEquals("failure", mirror.status)
        assertEquals(1, mirror.stories.size)
        assertTrue(mirror.stories.single().atomstr)

        cache.write("stringer-atomstr-v1:${source.id}", buildJsonObject {
            put("checkedAt", Instant.ofEpochMilli(fixture["now"]!!.jsonPrimitive.long - 8 * 24 * 60 * 60 * 1000L).toString())
            put("events", buildJsonArray { add(fixture["atomstr"]!!) })
        }.toString())
        assertEquals(1, core.cachedAtomstrSources(listOf(source)).getValue(source.id).stories.size)

        val tampered = storyEvents[0].jsonObject.toMutableMap().also { it["content"] = JsonPrimitive("changed") }
        cache.write("stringer-relay:${catalogue.relay.pubkey}", buildJsonObject {
            put("manifest", manifest)
            put("stories", buildJsonArray { add(JsonObject(tampered)) })
        }.toString())
        assertNull(core.cachedRelaySnapshot())

        val unreferencedForgery = storyEvents[0].jsonObject.toMutableMap().also {
            it["id"] = JsonPrimitive("a".repeat(64))
            it["content"] = JsonPrimitive("forged but not referenced by manifest")
        }
        cache.write("stringer-relay:${catalogue.relay.pubkey}", buildJsonObject {
            put("manifest", manifest)
            put("stories", buildJsonArray {
                addAll(storyEvents)
                add(JsonObject(unreferencedForgery))
            })
        }.toString())
        assertNull(core.cachedRelaySnapshot())
        cache.write("stringer-relay:${catalogue.relay.pubkey}", " ".repeat(5_000_001))
        assertNull(core.cachedRelaySnapshot())
    }

    @Test fun `safe link checks reject credentials non-web schemes and malformed hosts`() {
        for (url in listOf("javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.org/", "https://", "//example.org/story"))
            assertFalse(safeHttpUrl(url), url)
        assertTrue(safeHttpUrl("https://example.org/story?q=1#part"))
        assertEquals("https://example.org/search?q=a+b", decodeProvenanceUrl("https://example.org/feed", "https://example.org/feed#https%3A%2F%2Fexample.org%2Fsearch%3Fq%3Da+b"))
        assertTrue(Protocol.isRollback("2026-11-06T00:00:00Z", "2026-11-05T23:59:59Z"))
        assertFalse(Protocol.isRollback("2026-11-05T23:00:00Z", "2026-11-05T23:59:59Z"))
    }

    @Test fun `newer signed cache cannot be rolled back by an older relay manifest`() = runBlocking {
        val certificate = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        val serverCertificates = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val trusted = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val server = MockWebServer().apply { useHttps(serverCertificates.sslSocketFactory(), false) }
        val client = OkHttpClient.Builder()
            .sslSocketFactory(trusted.sslSocketFactory(), trusted.trustManager)
            .hostnameVerifier { _, _ -> true }
            .build()
        val older = fixture["olderManifest"]!!
        server.enqueue(MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val frame = Json.parseToJsonElement(text).jsonArray
                if (frame.firstOrNull()?.jsonPrimitive?.content != "REQ") return
                val subId = frame[1].jsonPrimitive.content
                webSocket.send(buildJsonArray { add("EVENT"); add(subId); add(older) }.toString())
                webSocket.send(buildJsonArray { add("EOSE"); add(subId) }.toString())
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }
        }))
        server.start()
        try {
            val relay = server.url("/").toString().replaceFirst("https://", "wss://")
            val cache = InMemorySnapshotCache()
            val cachedRaw = buildJsonObject {
                put("manifest", fixture["newerManifest"]!!)
                put("stories", fixture["batch"]!!.jsonObject["events"]!!)
            }.toString()
            cache.write("stringer-relay:${catalogue.relay.pubkey}", cachedRaw)
            val core = NewsCore(catalogueJson(relay), cache, client)
            val result = core.loadRelaySnapshot(timeoutMs = 2500)
            assertEquals("failure", result.status)
            assertTrue(result.isStale)
            assertEquals("Older collection", result.error)
            assertEquals(6, result.stories.size)
            assertEquals(cachedRaw, cache.read("stringer-relay:${catalogue.relay.pubkey}"))
        } finally {
            server.shutdown()
            client.dispatcher.executorService.shutdownNow()
        }
    }

    @Test fun `Atomstr requires pinned signature exact feed provenance and drops summary`() {
        val now = fixture["now"]!!.jsonPrimitive.long
        val source = Json.decodeFromJsonElement<AtomstrSource>(fixture["source"]!!)
        val event = Nostr.parse(fixture["atomstr"]!!, now)!!
        val core = NewsCore("""{"schemaVersion":1,"relay":{"pubkey":"${catalogue.relay.pubkey}","relays":["wss://relay.example"]},"atomstr":{"relays":["wss://atomstr.example"]},"editions":[{"id":"en-US","sources":[]}],"englishSources":${Json.encodeToString(JsonElement.serializer(), JsonArray(fixture["englishSources"]!!.jsonArray))},"contentPermissions":${Json.encodeToString(JsonElement.serializer(), JsonObject(fixture["permissions"]!!.jsonObject))}}""")
        val story = core.parseAtomstrEvent(event, source, now)
        assertNotNull(story)
        assertEquals("خبر أصلي — ação e ciência", story.title)
        assertEquals("https://example.org/original?q=1#part", story.url)
        assertEquals("", story.summary)
        assertNull(story.attribution)
        val tags = event.tags.map { it.toMutableList() }.toMutableList()
        val proxyIndex = tags.indexOfFirst { it.firstOrNull() == "proxy" }
        tags[proxyIndex] = mutableListOf("proxy", "https://evil.example/#https%3A%2F%2Fexample.org%2Foriginal", "rss")
        assertNull(core.parseAtomstrEvent(event.copy(tags = tags), source, now))
    }

    @Test fun `URL deduplication removes fragments but preserves distinct query URLs`() {
        val base = Story("1", "Headline", "https://example.org/article#one", "Publisher", sourceId = "bbc")
        val duplicate = base.copy(id = "2", url = "https://example.org/article#two")
        val distinct = base.copy(id = "3", url = "https://example.org/article?edition=2")
        val defaultPort = base.copy(id = "4", url = "https://example.org:443/article")
        assertEquals(listOf("1", "3"), Protocol.deduplicate(listOf(base, duplicate, distinct, defaultPort)).map { it.id })
    }
}
