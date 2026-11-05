# Stringer News for Android

The app is a native Kotlin and Jetpack Compose reader. It presents **World news** and **Courageous Stories** in the original article language. Publisher headlines remain headlines; only Stringer’s own stories include summaries and reporter credits. Story links open in the browser, and subscription notices are shown where the catalogue marks them.

## Editions and saved choices

The generated `app/src/main/assets/catalogue.json` supplies the ten editions, translated interface strings, pinned publishers, relay configuration, and content permissions. Do not edit that asset by hand; regenerate it from the repository catalogue. Arabic uses right-to-left layout, while article text follows its own script direction.

Edition and publisher choices are stored with Preferences DataStore. The Brazilian and Portugal Portuguese editions share the `pt` publisher preference key; each other edition keeps its own selection. English always shows all configured publishers.

## Refresh and offline behavior

`ReaderViewModel` owns loading, errors, cached results, and refresh work. The Compose UI observes its `StateFlow`. The core verifies signed relay events and Atomstr provenance, and the app stores only its bounded verified-event cache through `SnapshotCache`; cached events are revalidated when read. A cached collection remains visible if refresh fails.

The app reads the cache at startup, refreshes on launch and manual request, and checks again every five minutes while the activity is resumed. Refresh work is cancelled when the app backgrounds. It does not poll in the background or use photos, accounts, or notifications.

## Build and verify

Use JDK 17 for the Android app and JDK 21 for the core JVM tests, plus the Android SDK. From this directory:

```sh
./gradlew :app:assembleDebug
./gradlew :app:testDebugUnitTest
./gradlew :app:connectedDebugAndroidTest
```

The instrumentation smoke test injects an offline reader fixture. It covers both tabs, external story navigation, Arabic edition selection, and publisher-choice persistence across activity recreation.
