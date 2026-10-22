# Check the deployed homepage

Use Node 24+ and install the repository dependencies and Playwright Chromium.
Build the exact artifact being released, then check the final public homepage:

```sh
npm run build
READER_PUBLIC_URL=https://stringerjournalism.org/ npm run smoke:production
```

The check compares loaded script/style URL versions with the local
`_site/index.html`. A later rebuild generates a different version because the
build includes its timestamp. Retain the exact released artifact when checking
or rolling back. A Pages preview passing does not verify the homepage Worker's
configured upstream.

An independent monitor can supply the approved 16-character asset version
without retaining the build:

```sh
READER_PUBLIC_URL=https://stringerjournalism.org/ \
EXPECTED_READER_VERSION=0123456789abcdef node scripts/smoke-homepage.ts
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
node --import tsx --test tests/smoke.browser.mjs tests/smoke.test.mjs
```
