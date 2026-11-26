# Check the deployed homepage

Use Node 24+ and install the repository dependencies and Playwright Chromium.
Build the exact artifact being released, then check the final public homepage:

```sh
pnpm run export:snapshot   # refresh data/news.json from relays before release
STRINGER_REQUIRE_FRESH_SNAPSHOT=1 pnpm run build
READER_PUBLIC_URL=https://stringerjournalism.org/ pnpm run smoke:production
```

Confirm the CDN snapshot is live and cacheable:

```sh
curl -sI https://stringerjournalism.org/news-assets/data/news.json
curl -sI https://stringerjournalism.org/
curl -sI https://stringerjournalism.org/   # second request should report x-worker-cache: HIT
```

Expect JSON (not HTML/502) for the snapshot, short shared `cache-control` on
HTML/`news.json`/JS/CSS (never `immutable` on `?v=` paths), and
`x-worker-cache: HIT` on repeat homepage/asset GETs. Edition language
negotiation redirects stay `no-store`. Redeploy the homepage Worker after
changing cache behavior. The public Pages workflow runs `export:snapshot`
before packaging so cold loads do not keep a committed stale fallback.

The check compares loaded script/style URL versions with the local
`_site/index.html`. A later rebuild generates a different version because the
build includes its timestamp. Retain the exact released artifact when checking
or rolling back. A Pages preview passing does not verify the homepage Worker's
configured upstream.

An independent monitor can supply the approved 16-character asset version
without retaining the build:

```sh
READER_PUBLIC_URL=https://stringerjournalism.org/ \
EXPECTED_READER_VERSION=0123456789abcdef npm run smoke:production
```

Replace the example version with the value from the approved artifact's app.js
URL. The command fails with a nonzero exit status for an unavailable page,
missing/failed assets, a mismatched version, script errors, horizontal overflow,
no visible story within five seconds, or failure to finish with stories in both
columns within fifteen seconds. Each desktop/mobile check uses a separate empty
browser context. A partial verified collection may pass; JSON output retains
feed diagnostics and measured durations. A failed refresh with retained stories
fails the check. These are acceptance targets, not promises of relay speed.

This command neither deploys nor publishes Nostr events. An operator can run it
from an existing external monitoring system, alert on repeated failures and
recovery, and retain its JSON output. No recurring monitor is installed here.
On failure, compare the approved artifact with the Worker's served assets before
restoring a compatible previous release. Rerun against that release's recorded
version; never roll back to a reader incompatible with the current collection.

Run the synthetic checker regressions with:

```sh
node --import tsx --test tests/smoke.browser.ts tests/smoke.test.ts
```
