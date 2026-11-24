# Development

The native Android reader lives in [`android/`](../android/README.md). It uses the same signed relay protocol and publisher catalogues as the website. Generate its bundled editions and interface translations with `node --import tsx scripts/generate-android-catalogue.ts`; add `--check` to detect drift. Android development requires Java 17 and the Android SDK. See the [Android release guide](android-releases.md) for signing setup, Obtainium updates, and independent Zapstore publication.

Use Node 24 or newer and pnpm 11.18.0 (pinned in `package.json`). Install pnpm with `npm install --global pnpm@11.18.0` if needed:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:relay
pnpm run test:previews
pnpm run build
pnpm run test:artifact
pnpm exec playwright install chromium
pnpm run test:browser
pnpm run test:relay-browser
```

All maintained JavaScript source is now TypeScript: the reader, relay implementation, collector, build tooling, Workers, tests, and ESLint configuration share strict compiler checks. `pnpm run build` compiles browser source to the existing relative JavaScript asset paths in `_site`; TypeScript sources, declarations, and source maps are excluded from the published allowlist. Tests load source modules through `tsx`; browser fixtures compile their source with esbuild. Node 24+ runs build scripts with native type stripping and ESLint with its native TypeScript config loader.

The reader loads verified news from the configured Nostr relays. CI tests use synthetic fixtures. The publication build separately collects Kiswahili headlines for the static edition. Global publishers supply headlines, attribution, dates and original links; Stringer reporting and photos remain separate. See the [publication policy](../LEGAL.md). Source availability does not grant reuse rights to publisher material or photographs.

Relay lookups, story downloads and retries share a 15-second network loading budget. Partial refreshes retain displayed stories while keeping unavailable-note counts and source failures visible. Browser storage is optional: malformed or oversized caches are ignored, and only a verified cached collection can supply fallback stories or prevent an older collection from replacing newer reporting.

See the [testing and coverage guide](../TESTING.md) for the coverage suite and browser CI.
