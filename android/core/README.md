# Android news core

The JVM core validates the bundled catalogue, reads signed Nostr relay snapshots and pinned Atomstr feeds, and keeps publisher content within the catalogue's permissions. `NewsCore.loadRelaySnapshot()` has a 15 second maximum total budget; each Atomstr source has an 8 second maximum request budget, with no more than eight source reads active at once. The `onUpdate` callbacks publish verified partial relay snapshots and per-source Atomstr states as they arrive.

Construct `NewsCore` with the bundled `catalogue.json` text and a persistent `SnapshotCache`. The app should store the opaque strings as-is (for example, in a private SharedPreferences or DataStore file). They contain signed event envelopes and are untrusted on read: the core enforces size limits and rechecks signatures, author, kind, manifest references, source permissions and Atomstr provenance before returning stories. `InMemorySnapshotCache` is available for tests or callers that do not need persistence.

Relay states use `success`, `partial` or `failure`; Atomstr states use `success` or `failure`. Cache results carry `isStale=true` or a failure state until a network refresh succeeds. Stories expose the source as `publisher`, Stringer credits as `attribution`, and social mirror attribution as `mirroredVia`.

Run the module tests with `./gradlew :core:test`. Main bytecode targets Java 17; the ACINQ JVM test binding requires a Java 21 test runtime. Android must include `secp256k1-kmp-jni-android` at runtime.
