package org.stringerjournalism.news.core

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertTrue

class RelayTransportTest {
    private fun secureServer(): Pair<MockWebServer, OkHttpClient> {
        val certificate = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        val serverCertificates = HandshakeCertificates.Builder().heldCertificate(certificate).build()
        val trusted = HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build()
        val server = MockWebServer().apply { useHttps(serverCertificates.sslSocketFactory(), false) }
        val client = OkHttpClient.Builder()
            .sslSocketFactory(trusted.sslSocketFactory(), trusted.trustManager)
            .hostnameVerifier { _, _ -> true }
            .build()
        return server to client
    }

    @Test fun `silent relay is bounded by query deadline and does not stall`() = runBlocking {
        val (server, client) = secureServer()
        server.enqueue(MockResponse().withWebSocketUpgrade(object : WebSocketListener() {}))
        server.start()
        try {
            val ws = server.url("/").toString().replaceFirst("https://", "wss://")
            val started = System.nanoTime()
            val events = RelayTransport(client).query(listOf(ws), buildJsonObject { put("limit", 10) }, timeoutMs = 150)
            val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)
            assertTrue(events.isEmpty())
            assertTrue(elapsedMs < 1500, "silent relay took ${elapsedMs}ms")
        } finally { server.shutdown(); client.dispatcher.executorService.shutdownNow() }
    }

    @Test fun `relay close ends a websocket query without waiting for deadline`() = runBlocking {
        val (server, client) = secureServer()
        server.enqueue(MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                webSocket.close(1000, "fixture close")
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }
        }))
        server.start()
        try {
            val ws = server.url("/").toString().replaceFirst("https://", "wss://")
            val started = System.nanoTime()
            RelayTransport(client).query(listOf(ws), buildJsonObject { put("limit", 10) }, timeoutMs = 2000)
            val elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)
            assertTrue(elapsedMs < 1500, "graceful close took ${elapsedMs}ms")
        } finally { server.shutdown(); client.dispatcher.executorService.shutdownNow() }
    }
}
