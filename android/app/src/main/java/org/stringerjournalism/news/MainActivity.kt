package org.stringerjournalism.news

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.content.ActivityNotFoundException
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.delay
import androidx.lifecycle.repeatOnLifecycle
import org.json.JSONObject
import org.stringerjournalism.news.core.AtomstrFeed
import org.stringerjournalism.news.core.AtomstrSource
import org.stringerjournalism.news.core.NewsCore
import org.stringerjournalism.news.core.SnapshotCache
import java.net.URI

private val ComponentActivity.settingsStore by preferencesDataStore(name = "reader-settings")

class MainActivity : ComponentActivity() {
    companion object {
        @Volatile internal var readerDataSourceFactory: ((String, SnapshotCache) -> ReaderDataSource)? = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val catalogueJson = assets.open("catalogue.json").bufferedReader().use { it.readText() }
        val cache = SharedPreferencesSnapshotCache(getSharedPreferences("verified-news-cache", MODE_PRIVATE))
        val dataSource = readerDataSourceFactory?.invoke(catalogueJson, cache) ?: NewsCoreDataSource(NewsCore(catalogueJson, cache))
        val model = androidx.lifecycle.ViewModelProvider(this, ReaderViewModel.Factory(catalogueJson, dataSource, settingsStore))[ReaderViewModel::class.java]
        setContent { StringerApp(catalogueJson, model) }
    }
}

internal data class Edition(
    val id: String,
    val label: String,
    val preferenceKey: String,
    val direction: String,
    val strings: Map<String, String>,
    val sources: List<Publisher>,
)

internal data class Publisher(val id: String, val name: String, val homepage: String, val subscription: Boolean = false)
internal data class Article(
    val id: String,
    val title: String,
    val url: String,
    val publisher: String,
    val date: String?,
    val summary: String,
    val attribution: String?,
    val subscription: Boolean = false,
    val mirroredVia: String? = null,
)

internal fun JSONObject.string(key: String, fallback: String = ""): String = optString(key, fallback).takeUnless { it == "null" } ?: fallback
internal fun JSONObject.objectList(key: String): List<JSONObject> {
    val array = optJSONArray(key) ?: return emptyList()
    return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
}

internal fun readEditions(json: String): List<Edition> {
    val root = JSONObject(json)
    return root.objectList("editions").map { e ->
        val sources = e.objectList("sources").map { s ->
            Publisher(s.string("id"), s.string("name"), s.string("homepage"), s.optBoolean("mayRequireSubscription"))
        }
        val rawStrings = e.optJSONObject("strings") ?: JSONObject()
        val strings = rawStrings.keys().asSequence().associateWith { rawStrings.optString(it) }
        Edition(e.string("id"), e.string("label"), e.string("preferenceKey", e.string("id")), e.string("direction"), strings, sources)
    }
}

internal fun publishersFromCatalogue(json: String): List<Publisher> = JSONObject(json).objectList("englishSources").map { source ->
    Publisher(source.string("id"), source.string("name"), source.string("homepage"), source.optBoolean("mayRequireSubscription"))
}

internal fun readAtomstrSources(json: String, editionId: String): List<AtomstrSource> {
    val edition = JSONObject(json).objectList("editions").firstOrNull { it.string("id") == editionId } ?: return emptyList()
    return edition.objectList("sources").map { source ->
        AtomstrSource(
            id = source.string("id"),
            name = source.string("name"),
            homepage = source.string("homepage").ifEmpty { null },
            feeds = source.objectList("feeds").map { feed ->
                AtomstrFeed(feed.string("url"), feed.string("pubkey"), feed.string("social").ifEmpty { null })
            },
        )
    }
}

internal class SharedPreferencesSnapshotCache(private val prefs: android.content.SharedPreferences) : SnapshotCache {
    override fun read(key: String): String? = prefs.getString(key, null)
    override fun write(key: String, value: String) { prefs.edit().putString(key, value).apply() }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StringerApp(catalogueJson: String, model: ReaderViewModel) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val editions = remember(catalogueJson) { readEditions(catalogueJson) }
    val englishSources = remember(catalogueJson) { publishersFromCatalogue(catalogueJson) }
    val reader by model.state.collectAsStateWithLifecycle()
    val edition = editions.firstOrNull { it.id == reader.editionId } ?: editions.first()
    val publishers = if (edition.id == "en-US") englishSources.filter { it.id != "stringer" } else edition.sources
    val selected = if (edition.id == "en-US") publishers.map { it.id }.toSet() else reader.selectedSources
    val direction = if (edition.direction == "rtl") LayoutDirection.Rtl else LayoutDirection.Ltr

    var tab by remember { mutableIntStateOf(0) }
    var showSettings by remember { mutableStateOf(false) }
    LaunchedEffect(model) { model.initialize() }
    LaunchedEffect(lifecycle, model) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            try {
                model.refresh(false)
                while (true) {
                    delay(5 * 60 * 1000L)
                    model.refresh(false)
                }
            } finally {
                model.cancelRefresh()
            }
        }
    }

    val relayArticles = remember(reader.relaySnapshot, selected) {
        val sourceNames = (englishSources + editions.flatMap { it.sources }).associateBy { it.id }
        reader.relaySnapshot?.stories.orEmpty().filter { it.sourceId != "stringer" && it.sourceId in selected }.mapNotNull { story ->
            val publisher = sourceNames[story.sourceId] ?: return@mapNotNull null
            Article(story.id, story.title, story.url, publisher.name, story.publishedAt ?: story.publicationDate, "", story.attribution, publisher.subscription, story.mirroredVia)
        }.sortedByDescending { it.date.orEmpty() }
    }
    val relayCourageous = remember(reader.relaySnapshot) {
        reader.relaySnapshot?.stories.orEmpty().filter { it.sourceId == "stringer" }.map { story ->
            Article(story.id, story.title, story.url, story.publisher.ifBlank { "Stringer" }, story.publishedAt ?: story.publicationDate, story.summary, story.attribution)
        }.sortedByDescending { it.date.orEmpty() }
    }
    val atomArticles = remember(reader.atomStates, publishers, selected) {
        reader.atomStates.filterKeys { it in selected }.flatMap { (sourceId, state) ->
            val publisher = publishers.firstOrNull { it.id == sourceId }
            state.stories.map { story ->
                Article(story.id, story.title, story.url, publisher?.name ?: story.publisher, story.publishedAt ?: story.publicationDate, story.summary, story.attribution, publisher?.subscription == true, story.mirroredVia)
            }
        }.sortedByDescending { it.date.orEmpty() }
    }
    val worldItems = if (edition.id == "en-US") relayArticles else atomArticles
    val courageousItems = relayCourageous

    MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(
        primary = androidx.compose.ui.graphics.Color(0xFF9C432C),
        onPrimary = androidx.compose.ui.graphics.Color.White,
        background = androidx.compose.ui.graphics.Color(0xFFF7F5F1),
        surface = androidx.compose.ui.graphics.Color(0xFFFFFEFC),
    )) {
        CompositionLocalProvider(LocalLayoutDirection provides direction) {
            Scaffold(
                topBar = {
                    TopAppBar(
                        title = {
                            Column {
                                Text("STRINGER", fontSize = 12.sp, letterSpacing = 2.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                Text(t(edition, "Reporting selected by The Stringer Foundation."), fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                            }
                        },
                        actions = {
                            IconButton(onClick = { model.refresh(true) }) { Icon(Icons.Outlined.Refresh, contentDescription = t(edition, "Refresh")) }
                            IconButton(onClick = { showSettings = true }, modifier = Modifier.testTag("open-settings")) { Icon(Icons.Outlined.Tune, contentDescription = t(edition, "Sources")) }
                        },
                    )
                },
            ) { padding ->
                Column(Modifier.fillMaxSize().padding(padding)) {
                    TabRow(selectedTabIndex = tab) {
                        Tab(selected = tab == 0, onClick = { tab = 0 }, modifier = Modifier.testTag("tab-world"), text = { Text(t(edition, "World news")) })
                        Tab(selected = tab == 1, onClick = { tab = 1 }, modifier = Modifier.testTag("tab-courageous"), text = { Text(t(edition, "Courageous Stories")) })
                    }
                    val shown = if (tab == 0) worldItems else courageousItems
                    val refreshingState = reader.loading
                    val anyFailures = if (tab == 0) {
                        if (edition.id == "en-US") reader.relayError != null || reader.relaySnapshot?.status in listOf("failure", "partial") else reader.atomStates.filterKeys { it in selected }.values.any { it.status == "failure" }
                    } else reader.relayError != null || reader.relaySnapshot?.status in listOf("failure", "partial")
                    val stale = if (tab == 0 && edition.id != "en-US") reader.atomStates.filterKeys { it in selected }.values.any { it.status == "failure" && it.stories.isNotEmpty() } else reader.relaySnapshot?.isStale == true
                    FeedScreen(
                        edition = edition,
                        articles = shown,
                        loading = refreshingState,
                        failure = anyFailures,
                        stale = stale,
                        hasAttempted = reader.hasAttempted,
                        emptyFailure = if (tab == 1) t(edition, "Courageous stories unavailable. You can still visit the Stringer collection below.") else t(edition, "The news collection is unavailable. We’ll retry automatically."),
                        emptyMessage = if (tab == 1) t(edition, "No courageous stories are available.") else t(edition, "No headlines available in this collection."),
                        onOpen = { url -> openExternal(context, url) },
                        onRetry = { model.refresh(true) },
                    )
                }
            }
        }
    }

    if (showSettings) {
        CompositionLocalProvider(LocalLayoutDirection provides direction) {
            SettingsDialog(
                editions = editions,
                selectedEdition = edition,
                publishers = publishers,
                selectedSources = selected,
                onEdition = { model.selectEdition(it) },
                onToggleSource = { id, enabled -> model.toggleSource(id, enabled) },
                onDismiss = { showSettings = false },
            )
        }
    }
}

private fun t(edition: Edition, text: String): String = edition.strings[text]?.takeIf { it.isNotBlank() } ?: text
internal fun safeExternalUrl(value: String): String? = try {
    val uri = URI(value)
    if (uri.scheme in listOf("https", "http") && !uri.host.isNullOrBlank() && uri.userInfo == null) uri.toASCIIString() else null
} catch (_: Exception) { null }

private fun openExternal(context: android.content.Context, value: String) {
    val url = safeExternalUrl(value) ?: return
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: ActivityNotFoundException) {
        android.widget.Toast.makeText(context, "No browser is available to open this story.", android.widget.Toast.LENGTH_SHORT).show()
    }
}

@Composable
private fun FeedScreen(
    edition: Edition,
    articles: List<Article>,
    loading: Boolean,
    failure: Boolean,
    stale: Boolean,
    hasAttempted: Boolean,
    emptyFailure: String,
    emptyMessage: String,
    onOpen: (String) -> Unit,
    onRetry: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        if (stale) StatusBanner(t(edition, "Could not check for updates. Keeping the previously loaded collection."))
        else if (failure && articles.isNotEmpty()) StatusBanner(t(edition, "Partial"))
        if (loading && articles.isNotEmpty()) Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
            Text("  ${t(edition, "Checking for updates…")}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        when {
            articles.isNotEmpty() -> LazyColumn(contentPadding = PaddingValues(start = 18.dp, top = 14.dp, end = 18.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(articles, key = { it.id + it.url }) { article -> StoryCard(article, edition, onOpen) }
            }
            loading || !hasAttempted -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(14.dp))
                    Text(t(edition, "Loading the latest stories…"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            failure -> EmptyState(emptyFailure, t(edition, "Try again"), onRetry)
            else -> EmptyState(emptyMessage, t(edition, "Refresh"), onRetry)
        }
    }
}

@Composable
private fun StoryCard(article: Article, edition: Edition, onOpen: (String) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().testTag("article:${article.id}").clickable(enabled = safeExternalUrl(article.url) != null) { onOpen(article.url) },
        shape = RoundedCornerShape(15.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, androidx.compose.ui.graphics.Color(0xFFE8E3DC)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(Modifier.padding(horizontal = 17.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(article.publisher.uppercase(), fontSize = 11.sp, letterSpacing = 1.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                if (article.date != null) Text(article.date.take(10), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(9.dp))
            Text(article.title, style = TextStyle(fontSize = 19.sp, lineHeight = 25.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface, textDirection = TextDirection.Content))
            if (article.summary.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(article.summary, style = TextStyle(fontSize = 14.sp, lineHeight = 21.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, textDirection = TextDirection.Content))
            }
            if (article.attribution != null || article.subscription || article.mirroredVia != null) {
                Spacer(Modifier.height(10.dp))
                Text(
                    listOfNotNull(article.attribution, article.mirroredVia?.let { "via $it / Atomstr" }, if (article.subscription) t(edition, "May require subscription") else null).joinToString(" · "),
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(t(edition, "Read at source"), fontSize = 13.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(5.dp))
                Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = null, modifier = Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun StatusBanner(text: String) {
    Surface(color = androidx.compose.ui.graphics.Color(0xFFFFF0D6)) {
        Text(text, Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 9.dp), fontSize = 12.sp, color = androidx.compose.ui.graphics.Color(0xFF704C15))
    }
}

@Composable
private fun EmptyState(message: String, action: String, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(message, fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            Button(onClick = onRetry) { Text(action) }
        }
    }
}

@Composable
private fun SettingsDialog(
    editions: List<Edition>,
    selectedEdition: Edition,
    publishers: List<Publisher>,
    selectedSources: Set<String>,
    onEdition: (String) -> Unit,
    onToggleSource: (String, Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    var showPublishers by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(t(selectedEdition, "Sources")) },
        text = {
            Column {
                if (!showPublishers) {
                    Text(t(selectedEdition, "Language"), fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(6.dp))
                    editions.forEach { edition ->
                        Row(Modifier.fillMaxWidth().clickable { onEdition(edition.id) }.testTag("edition:${edition.id}").semantics { selected = edition.id == selectedEdition.id }.padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(if (edition.id == selectedEdition.id) "●" else "○", color = MaterialTheme.colorScheme.primary, modifier = Modifier.width(28.dp))
                            Text(edition.label)
                        }
                    }
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))
                    if (selectedEdition.id != "en-US") TextButton(onClick = { showPublishers = true }, modifier = Modifier.testTag("publisher-picker"), contentPadding = PaddingValues(0.dp)) { Text(t(selectedEdition, "Choose news sources")) }
                } else {
                    Text(t(selectedEdition, "Choose news sources"), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(6.dp))
                    LazyColumn(Modifier.height(360.dp)) {
                items(publishers, key = { it.id }) { publisher ->
                            Row(Modifier.fillMaxWidth().clickable { onToggleSource(publisher.id, publisher.id !in selectedSources) }.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = publisher.id in selectedSources, onCheckedChange = { onToggleSource(publisher.id, it) }, modifier = Modifier.testTag("source:${publisher.id}"))
                                Text(publisher.name, modifier = Modifier.weight(1f))
                                if (publisher.subscription) Text("SUB", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    TextButton(onClick = { showPublishers = false }, contentPadding = PaddingValues(0.dp)) { Text(t(selectedEdition, "Language")) }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss, modifier = Modifier.testTag("settings-done")) { Text(t(selectedEdition, "Close menu")) } },
    )
}
