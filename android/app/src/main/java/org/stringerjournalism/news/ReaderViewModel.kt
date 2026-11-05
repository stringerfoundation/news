package org.stringerjournalism.news

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext
import org.stringerjournalism.news.core.NewsCore
import org.stringerjournalism.news.core.Snapshot
import org.stringerjournalism.news.core.SourceState
import org.stringerjournalism.news.core.AtomstrSource

internal interface ReaderDataSource {
    suspend fun loadRelaySnapshot(onUpdate: (Snapshot) -> Unit = {}): Snapshot
    fun cachedRelaySnapshot(): Snapshot?
    suspend fun loadAtomstrSources(sources: List<AtomstrSource>, onUpdate: (String, SourceState) -> Unit = { _, _ -> }): Map<String, SourceState>
    fun cachedAtomstrSources(sources: List<AtomstrSource>): Map<String, SourceState>
}

internal class NewsCoreDataSource(private val core: NewsCore) : ReaderDataSource {
    override suspend fun loadRelaySnapshot(onUpdate: (Snapshot) -> Unit): Snapshot = core.loadRelaySnapshot(onUpdate = onUpdate)
    override fun cachedRelaySnapshot(): Snapshot? = core.cachedRelaySnapshot()
    override suspend fun loadAtomstrSources(sources: List<AtomstrSource>, onUpdate: (String, SourceState) -> Unit): Map<String, SourceState> =
        core.loadAtomstrSources(sources, onUpdate = onUpdate)
    override fun cachedAtomstrSources(sources: List<AtomstrSource>): Map<String, SourceState> = core.cachedAtomstrSources(sources)
}

internal data class ReaderUiState(
    val editionId: String = "en-US",
    val selectedSources: Set<String> = emptySet(),
    val relaySnapshot: Snapshot? = null,
    val atomStates: Map<String, SourceState> = emptyMap(),
    val loading: Boolean = false,
    val hasAttempted: Boolean = false,
    val relayError: String? = null,
)

internal class ReaderViewModel(
    private val catalogueJson: String,
    private val core: ReaderDataSource,
    private val store: DataStore<Preferences>,
) : ViewModel() {
    private val editions = readEditions(catalogueJson)
    private val englishSources = publishersFromCatalogue(catalogueJson)
    private val _state = MutableStateFlow(ReaderUiState())
    val state: StateFlow<ReaderUiState> = _state.asStateFlow()
    private var settingsJob: Job? = null
    private var refreshJob: Job? = null
    private var lastAttemptAt = 0L
    private var refreshGeneration = 0L

    fun initialize() {
        if (settingsJob != null) return
        settingsJob = viewModelScope.launch {
            val settings = store.data.first()
            val savedEdition = settings[stringPreferencesKey("edition")]
            val edition = editions.firstOrNull { it.id == savedEdition } ?: editions.first()
            val sources = publishersFor(edition).map { it.id }.toSet()
            val selected = settings[stringSetPreferencesKey("sources.${edition.preferenceKey}")] ?: sources
            _state.update { it.copy(editionId = edition.id, selectedSources = if (edition.id == "en-US") sources else selected) }
            _state.update { it.copy(relaySnapshot = withContext(Dispatchers.IO) { core.cachedRelaySnapshot() }) }
            loadCachedEdition(edition.id)
            refresh(true)
            store.data.collect { preferences ->
                val nextEditionId = preferences[stringPreferencesKey("edition")] ?: edition.id
                val nextEdition = editions.firstOrNull { it.id == nextEditionId } ?: editions.first()
                val defaultSources = publishersFor(nextEdition).map { it.id }.toSet()
                val selectedSources = preferences[stringSetPreferencesKey("sources.${nextEdition.preferenceKey}")] ?: defaultSources
                val changedEdition = _state.value.editionId != nextEdition.id
                _state.update { it.copy(editionId = nextEdition.id, selectedSources = if (nextEdition.id == "en-US") defaultSources else selectedSources) }
                if (changedEdition) {
                    cancelRefresh()
                    loadCachedEdition(nextEdition.id)
                    refresh(true)
                }
            }
        }
    }

    fun selectEdition(id: String) {
        viewModelScope.launch { store.edit { it[stringPreferencesKey("edition")] = id } }
    }

    fun toggleSource(id: String, enabled: Boolean) {
        val edition = editions.firstOrNull { it.id == _state.value.editionId } ?: return
        if (edition.id == "en-US") return
        viewModelScope.launch {
            store.edit { prefs ->
                val key = stringSetPreferencesKey("sources.${edition.preferenceKey}")
                val defaults = publishersFor(edition).map { it.id }.toSet()
                val selected = (prefs[key] ?: defaults).toMutableSet()
                if (enabled) selected += id else selected -= id
                prefs[key] = selected
            }
        }
    }

    fun refresh(force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - lastAttemptAt < FIVE_MINUTES) return
        if (refreshJob?.isActive == true) return
        lastAttemptAt = now
        val generation = ++refreshGeneration
        val edition = editions.firstOrNull { it.id == _state.value.editionId } ?: editions.first()
        refreshJob = viewModelScope.launch(Dispatchers.IO) {
            _state.update { it.copy(loading = true, hasAttempted = true, relayError = null) }
            val sources = readAtomstrSources(catalogueJson, edition.id)
            try {
                supervisorScope {
                    val relay = async {
                        try {
                            val value = core.loadRelaySnapshot(onUpdate = { snapshot -> _state.update { it.copy(relaySnapshot = snapshot) } })
                            _state.update { it.copy(relaySnapshot = value, relayError = null) }
                        } catch (error: Exception) {
                            if (error is CancellationException) throw error
                            _state.update { it.copy(relayError = error.message ?: "Relay unavailable") }
                        }
                    }
                    val feeds = async {
                        try {
                            core.loadAtomstrSources(sources, onUpdate = { sourceId, state ->
                                _state.update { current -> current.copy(atomStates = current.atomStates + (sourceId to state)) }
                            }).let { states -> _state.update { it.copy(atomStates = it.atomStates + states) } }
                        } catch (error: Exception) {
                            if (error is CancellationException) throw error
                            _state.update { current ->
                                val fallback = sources.associate { source ->
                                    source.id to (current.atomStates[source.id]?.copy(status = "failure", error = error.message ?: "Source unavailable")
                                        ?: SourceState(emptyList(), "failure", error.message ?: "Source unavailable", java.time.Instant.now().toString()))
                                }
                                current.copy(atomStates = current.atomStates + fallback)
                            }
                        }
                    }
                    relay.await()
                    feeds.await()
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } finally {
                if (generation == refreshGeneration) _state.update { it.copy(loading = false) }
            }
        }
    }

    fun cancelRefresh() {
        refreshGeneration++
        refreshJob?.cancel()
        refreshJob = null
        _state.update { it.copy(loading = false) }
    }

    private suspend fun loadCachedEdition(id: String) {
        val sources = readAtomstrSources(catalogueJson, id)
        val cached = withContext(Dispatchers.IO) { core.cachedAtomstrSources(sources) }
        _state.update { it.copy(atomStates = it.atomStates + cached) }
    }

    private fun publishersFor(edition: Edition): List<Publisher> =
        if (edition.id == "en-US") englishSources.filter { it.id != "stringer" } else edition.sources

    companion object {
        private const val FIVE_MINUTES = 5 * 60 * 1000L
        fun Factory(json: String, core: ReaderDataSource, store: DataStore<Preferences>) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = ReaderViewModel(json, core, store) as T
        }
    }
}
