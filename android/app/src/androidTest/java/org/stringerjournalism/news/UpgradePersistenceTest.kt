package org.stringerjournalism.news

import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.BeforeClass
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.stringerjournalism.news.core.AtomstrSource
import org.stringerjournalism.news.core.NewsCore
import org.stringerjournalism.news.core.Snapshot
import org.stringerjournalism.news.core.SourceState

/** Run `#seed`, upgrade-install the next APK with `adb install -r`, then run `#verify`. */
@RunWith(AndroidJUnit4::class)
class UpgradePersistenceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    companion object {
        @JvmStatic @BeforeClass fun useOfflineReader() {
            MainActivity.readerDataSourceFactory = { _, _ -> object : ReaderDataSource {
                override suspend fun loadRelaySnapshot(onUpdate: (Snapshot) -> Unit): Snapshot = error("Offline upgrade fixture")
                override fun cachedRelaySnapshot(): Snapshot? = null
                override suspend fun loadAtomstrSources(sources: List<AtomstrSource>, onUpdate: (String, SourceState) -> Unit): Map<String, SourceState> = emptyMap()
                override fun cachedAtomstrSources(sources: List<AtomstrSource>): Map<String, SourceState> = emptyMap()
            } }
        }
    }

    @Test
    fun seed() {
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("edition:ar").performClick()
        waitForTag("publisher-picker")
        compose.onNodeWithTag("publisher-picker").performClick()
        if (runCatching { compose.onNodeWithTag("source:ar-al-sharq").assertIsOff() }.isFailure) {
            compose.onNodeWithTag("source:ar-al-sharq").performClick()
        }
        waitForPublisherOff()
        compose.onNodeWithTag("settings-done").performClick()

        val (fixture, fixtureCatalogue) = fixtureData()
        val batch = fixture.getJSONObject("batch")
        val cachePayload = JSONObject()
            .put("manifest", batch.getJSONObject("manifest"))
            .put("stories", batch.getJSONArray("events"))
        val appCache = SharedPreferencesSnapshotCache(compose.activity.getSharedPreferences("verified-news-cache", 0))
        val cacheKey = "stringer-relay:${fixture.getString("pubkey")}"
        appCache.write(cacheKey, cachePayload.toString())

        val cached = NewsCore(fixtureCatalogue, appCache).cachedRelaySnapshot()
        assertNotNull("signed offline cache should verify before upgrade", cached)
        assertEquals(6, cached!!.stories.size)
    }

    @Test
    fun verify() {
        compose.onNodeWithTag("open-settings").performClick()
        waitForTag("edition:ar")
        compose.onNodeWithTag("edition:ar").assertIsSelected()
        compose.onNodeWithTag("publisher-picker").performClick()
        waitForPublisherOff()

        val (fixture, fixtureCatalogue) = fixtureData()
        val appCache = SharedPreferencesSnapshotCache(compose.activity.getSharedPreferences("verified-news-cache", 0))
        val cached = NewsCore(fixtureCatalogue, appCache).cachedRelaySnapshot()
        assertNotNull("signed offline cache should survive app update and still verify", cached)
        assertEquals(6, cached!!.stories.size)
        assertEquals("stringer", cached.stories.first { it.sourceId == "stringer" }.sourceId)
        assertEquals(fixture.getString("pubkey"), JSONObject(fixtureCatalogue).getJSONObject("relay").getString("pubkey"))
    }

    private fun waitForTag(tag: String) {
        compose.waitUntil(10_000) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun waitForPublisherOff() {
        compose.waitUntil(10_000) {
            runCatching { compose.onNodeWithTag("source:ar-al-sharq").assertIsOff() }.isSuccess
        }
    }

    private fun fixtureData(): Pair<JSONObject, String> {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val fixture = instrumentation.context.assets.open("web-protocol.json").bufferedReader().use { JSONObject(it.readText()) }
        val appCatalogue = compose.activity.assets.open("catalogue.json").bufferedReader().use { it.readText() }
        val oldPubkey = JSONObject(appCatalogue).getJSONObject("relay").getString("pubkey")
        val fixtureCatalogue = appCatalogue.replace(oldPubkey, fixture.getString("pubkey"))
        return fixture to fixtureCatalogue
    }
}
