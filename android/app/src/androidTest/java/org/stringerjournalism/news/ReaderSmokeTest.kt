package org.stringerjournalism.news

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intended
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.intent.matcher.IntentMatchers.hasData
import org.junit.Rule
import org.junit.Before
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import org.junit.runner.RunWith
import org.hamcrest.Matchers.allOf
import org.junit.Assert.assertEquals
import org.stringerjournalism.news.core.AtomstrSource
import org.stringerjournalism.news.core.InMemorySnapshotCache
import org.stringerjournalism.news.core.NewsCore
import org.stringerjournalism.news.core.Snapshot
import org.stringerjournalism.news.core.SnapshotCache
import org.stringerjournalism.news.core.SourceState
import org.stringerjournalism.news.core.Story

@RunWith(AndroidJUnit4::class)
class ReaderSmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Before
    fun selectEnglishBeforeEachTest() {
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("edition:en-US").performClick()
        compose.onNodeWithTag("settings-done").performClick()
    }

    companion object {
        private const val STORY_URL = "https://example.org/story/42"

        @JvmStatic @BeforeClass fun installOfflineReader() {
            MainActivity.readerDataSourceFactory = { _, _ -> object : ReaderDataSource {
                private val snapshot = Snapshot(
                    stories = listOf(
                        Story("fixture-world", "A test world headline", STORY_URL, "BBC World", "2026-11-05T12:00:00Z", sourceId = "bbc"),
                        Story("fixture-stringer", "A courageous test story", "https://stringerjournalism.org/courageous-stories/test", "Stringer", "2026-11-05T11:00:00Z", "Reporter summary", "Reporter credit", sourceId = "stringer"),
                    ),
                    status = "success",
                )
                override suspend fun loadRelaySnapshot(onUpdate: (Snapshot) -> Unit): Snapshot { onUpdate(snapshot); return snapshot }
                override fun cachedRelaySnapshot(): Snapshot? = snapshot
                override suspend fun loadAtomstrSources(sources: List<AtomstrSource>, onUpdate: (String, SourceState) -> Unit): Map<String, SourceState> = emptyMap()
                override fun cachedAtomstrSources(sources: List<AtomstrSource>): Map<String, SourceState> = emptyMap()
            } }
        }

        @JvmStatic @AfterClass fun clearOfflineReader() { MainActivity.readerDataSourceFactory = null }
    }

    @Test
    fun offlineNavigationAndArabicPublisherChoiceSurviveRecreation() {
        compose.onNodeWithTag("tab-world").assertIsDisplayed()
        compose.onNodeWithTag("tab-courageous").assertIsDisplayed().performClick()
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("edition:ar").assertIsDisplayed().performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("publisher-picker").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("publisher-picker").performClick()
        compose.onNodeWithTag("source:ar-al-sharq").assertIsDisplayed().performClick()
        assertPublisherOff()
        compose.activityRule.scenario.recreate()
        compose.onNodeWithTag("tab-world").assertIsDisplayed()
        compose.onNodeWithTag("open-settings").performClick()
        compose.onNodeWithTag("edition:ar").assertIsDisplayed()
        compose.onNodeWithTag("publisher-picker").performClick()
        assertPublisherOff()
    }

    private fun assertPublisherOff() {
        compose.waitUntil(10_000) {
            runCatching { compose.onNodeWithTag("source:ar-al-sharq").assertIsOff() }.isSuccess
        }
    }

    @Test
    fun storyOpensItsOriginalExternalLink() {
        Intents.init()
        try {
            compose.waitUntil(10_000) {
                compose.onAllNodesWithTag("article:fixture-world").fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithTag("article:fixture-world").assertIsDisplayed().performClick()
            intended(allOf(hasAction(Intent.ACTION_VIEW), hasData(Uri.parse(STORY_URL))))
        } finally {
            Intents.release()
        }
    }

    @Test
    fun appAtomstrSourcesMatchThePinnedCoreCatalogue() {
        val json = compose.activity.assets.open("catalogue.json").bufferedReader().use { it.readText() }
        val coreSources = NewsCore(json, InMemorySnapshotCache()).catalogue.editions.getValue("ar")
        assertEquals(coreSources, readAtomstrSources(json, "ar"))
    }
}
