# Android releases

Android CI runs for pull requests and pushes to `main` when Android app, Gradle, release helper, Zapstore, or Android workflow files change. It runs JVM unit tests, Android lint, a debug build, and an emulator install-and-launch smoke check. Only a successful push run from this repository's `main` branch can start the signed release workflow.

## Release numbering and files

The Android release workflow's run number is the Android `versionCode`; the app version is `0.1.N`. Releases use the matching immutable tag `android-v0.1.N`. A rerun retains the same run number and tag. Release jobs are serialized. A run proceeds only when its source commit belongs to current `main` history and is not older than the latest Android release's source; unrelated website commits do not invalidate an Android commit that remains on `main`. If a tag already points at a different source commit, the workflow stops rather than replacing the release. If the release already exists for the same commit, the workflow leaves its assets unchanged.

Each GitHub release contains `app-release.apk`, `app-release.apk.sha256`, and `android-release-provenance.txt`. The provenance lists the source commit, CI run ID, version, APK SHA-256, and verified signing certificate SHA-256 fingerprint. Verify the checksum after download with `sha256sum --check app-release.apk.sha256`.

## Required repository secrets and private key backup

Before merging Android release automation, configure these **Actions secrets** in the repository settings:

- `ANDROID_KEYSTORE_BASE64`: base64 of the release keystore file.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_ALIAS`: signing alias.
- `ANDROID_KEY_PASSWORD`: alias password.
- `ZAPSTORE_SIGNER_BUNKER`: a dedicated NIP-46 bunker URL authorized to sign as the existing Stringer Nostr public key `b8225dbedf6ae7949e880e7979e975d8e6f238f32d318bc4a562ecb198fcd707`. The publisher checks the authenticated signing identity and certificate proof with `zsp check --json`; the bunker's transport key can differ from that identity.

The signed GitHub release fails closed when any Android signing secret is missing. Zapstore publication uses the same Android keystore password to verify the APK and the separate `ZAPSTORE_SIGNER_BUNKER` secret to sign Nostr events. A Zapstore failure is isolated from the GitHub release; retry it from **Actions → Android Zapstore publish → Run workflow** with the existing `android-v0.1.N` tag.

Keep the original keystore and its passwords in an encrypted, access-controlled private backup outside this repository. Keep at least one recovery copy in a separate secure location. Losing the signing key prevents compatible upgrades for existing installs. Never commit the keystore, paste secrets into chat or logs, or store private signing material in the project. Record who can restore the backup and test access to it without exposing its contents.

If no permanent Android signing key exists yet, create it once on the trusted operator machine, outside the checkout. Let `keytool` prompt for passwords rather than putting them in command arguments or shell history:

```sh
keytool -genkeypair -keystore stringer-news-release.keystore -alias stringer-news -keyalg RSA -keysize 4096 -validity 10000
keytool -list -v -keystore stringer-news-release.keystore -alias stringer-news
```

Retain its SHA-256 certificate fingerprint with the private backup and compare it to every released APK's provenance. Reuse this same key for every update; do not generate a new key in CI.

To create the repository secret locally, base64-encode the already-created keystore on your own machine and paste it directly into the GitHub secret form; do not send the encoded value to an assistant. For example, macOS uses `base64 -i android-release.keystore | pbcopy`; on Linux use `base64 -w 0 android-release.keystore`. Keep terminal history free of passwords.

## One-time Zapstore certificate proof

Zapstore associates the Android signing certificate with the Nostr publisher identity using its C1 certificate proof. Complete this once on a trusted operator machine before enabling automated publishes:

1. Install the pinned official `zsp` v2.0.0 binary from [Zapstore's release](https://github.com/zapstore/zsp/releases/tag/v2.0.0). Verify the downloaded binary against the published release digest: Linux AMD64 `5483806beafde1b5deaa16f5efbead35a211b7d6015752f86d099e0faecc4a66`, or macOS ARM64 `7d122e790be8cbb9c26ac8fddc401be4a644e460b181bcc59ced44bdddcc67aa` (the CI publisher performs this check automatically).
2. Use the interactive `zsp` wizard with the signed Stringer APK, the Android keystore password, and the dedicated bunker for the existing Stringer public key above. Follow the wizard's certificate-linking step and verify it reports the expected package and certificate. Do this locally; do not give the keystore, passwords, bunker URL, private key, or `.env` file to an assistant.
3. After the relay accepts the proof, add `ZAPSTORE_SIGNER_BUNKER` and confirm `ANDROID_KEYSTORE_PASSWORD` is configured in repository Actions secrets. The separate Zapstore workflow then publishes only the APK downloaded from the matching GitHub release and pins the exact APK hash with `zsp publish --apk-hash`.

The workflow intentionally does not create a replacement publisher identity or silently fall back to unsigned or unverified publishing. It verifies the signer identity and active C1 certificate proof with `zsp check --json` before publication. If Zapstore already reports this version code, a retry uses `--overwrite-release` and the exact checked APK hash; if Zapstore reports a higher code, the stale release is rejected. Keep the existing identity and keystore available for certificate proof renewals.

## Obtainium

For direct GitHub updates, add `https://github.com/stringerfoundation/news` in Obtainium as the app source. Set **Filter Release Titles by Regular Expression** to `^android-v0\.1\.[0-9]+$` and **APK Filter Regex** to `^app-release\.apk$`. Release titles match their tags, and the signed asset name is fixed. Confirm the first installed APK's signer matches the certificate fingerprint in the GitHub release provenance before accepting updates. Obtainium then tracks the same signed APK and version code as the GitHub release.

Zapstore's publisher metadata is in [`zapstore.yaml`](../zapstore.yaml). Zapstore publication is a separate workflow so a relay, Blossom, signer, or network failure never deletes or blocks the GitHub release.

## References

- [Zapstore publishing guide](https://zapstore.dev/docs/publish)
- [Zapstore zsp v2.0.0 release](https://github.com/zapstore/zsp/releases/tag/v2.0.0)
- [Zapstore zsp v2.0.0 publisher instructions](https://github.com/zapstore/zsp/blob/v2.0.0/SKILL.md)
