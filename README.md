# Stringer website

Public source for the news homepage at https://stringerjournalism.org/.

## Hosting

GitHub Actions checks pull requests and pushes. Successful CI on `main` updates production at https://stringerfoundation.github.io/news/. Successful same-repository PR builds are published alongside production at `/news/pr-preview/<number>/`. Each PR receives one bot comment linking to its deployed preview and the checked commit.

The Cloudflare Worker in `deploy/homepage-worker/` serves `/` and `/news-assets/` from that Pages site. Other paths and form requests continue to Hostinger. The separate news-subdomain Worker redirects visitors to the main homepage. GitHub Pages has no custom domain; the public website domains stay on Cloudflare and Hostinger.

The private collector and dashboard continue running independently on the operator's server. This repository contains only the public reader, public relay protocol and configuration, public assets, Worker code, and tests. Never add credentials, private keys, journalist CSV files, or databases.

## Development

Use Node 24 or newer:

```sh
npm ci
npm run check
npm run lint
npm run typecheck
npm test
npm run test:relay
npm run test:previews
npm run build
npm run test:artifact
npx playwright install chromium
npm run test:browser
npm run test:relay-browser
```

All maintained JavaScript source is now TypeScript: the reader, relay implementation, collector, build tooling, Workers, tests, and ESLint configuration share strict compiler checks. `npm run build` compiles browser source to the existing relative JavaScript asset paths in `_site`; TypeScript sources, declarations, and source maps are excluded from the published allowlist. Tests load source modules through `tsx`; browser fixtures compile their source with esbuild. Node 24+ runs build scripts with native type stripping and ESLint with its native TypeScript config loader.

The reader loads verified news from the configured Nostr relays. CI uses synthetic fixtures; it does not publish or collect news. Global publishers supply headlines, attribution, dates and original links; Stringer reporting and photos remain separate. See `LEGAL.md` for the publication policy. Source availability does not grant reuse rights to publisher material or photographs.

Relay lookups, story downloads and retries share a 15-second network loading budget. Partial refreshes retain displayed stories while keeping unavailable-note counts and source failures visible. Browser storage is optional: malformed or oversized caches are ignored, and only a verified cached collection can supply fallback stories or prevent an older collection from replacing newer reporting.

## Worker configuration

Keep Wrangler configuration and Cloudflare account/zone details outside tracked source. Set `PAGES_ORIGIN=https://stringerfoundation.github.io/news/`, `PUBLIC_HOST=stringerjournalism.org`, and `PUBLIC_INDEXING=true`. Deploy as a Worker Route over the existing Hostinger DNS origin. Hostinger passthrough preserves methods, headers, bodies and queries. Pages requests omit visitor cookies and credentials. The Worker preserves the repository path in the Pages origin.

The Worker serves the apex Nostr identity endpoint directly. The existing news-subdomain redirect and identity handling remain independent. Worker deployment is a separate operator action; frontend updates deploy automatically through GitHub Actions without a Cloudflare token in GitHub.

To roll back the Pages origin, restore the previous `PAGES_ORIGIN` in private operator configuration and redeploy the Worker. Disabling the homepage route restores Hostinger's original homepage.

## License

Original project code is licensed under the [MIT License](LICENSE). This license does not grant rights to Stringer names, trademarks, logos, reporting, photographs, or third-party content. Those materials retain their respective rights and permissions; see `LEGAL.md`. Dependency licenses remain applicable.

## Continuous integration

Every pull request and push to `main` runs syntax and lint checks, strict TypeScript checks for all maintained source, unit tests on Node 24 and 26, signed-event security tests, workflow lint, a redacted Git history secret scan, dependency auditing, and CodeQL security analysis. A separate browser job builds the public artifact and verifies its exact allowlist, relative assets, content versions, and production indexing metadata before running desktop/mobile browser regressions, including relay streaming, a silent relay, missing notes, and offline cache recovery. Test fixtures are synthetic and never publish events.

The browser job uploads its checked public assets as a `checked-site` artifact. A separate publisher (`previews.yml`) runs only trusted `main` code, verifies successful CI provenance and current commit heads, and treats PR archives as data. It rejects unknown files, traversal, links, oversized archives, and incomplete builds. PR builds have no deployment permissions; fork PRs are tested but are not automatically published on the production origin. Actions use immutable commit pins and checkout does not persist credentials. Worker deployment remains a separate operator action.

## PR previews

The generated `pages-state` branch in this same repository holds the last checked production build, active previews, and deployment metadata. Only its `site/` directory is uploaded to Pages. A PR update replaces its own preview; a production update preserves all active previews. Closing or merging a PR removes its preview and updates the bot comment after the combined Pages deployment succeeds. Failed or pending CI retains the previous preview, whose comment identifies the actual checked commit. Generated state survives CI artifact expiry. Adding public asset names requires updating both the artifact-test and trusted publisher allowlists.

Automated mobile, tablet, and desktop screenshots are published only for PRs whose full diff changes reader HTML/CSS, browser JavaScript/TypeScript, or visual assets. Documentation, tests, tooling, and CI-only PRs still run browser checks but do not publish screenshots. Images are shown directly in the PR comment, without collapsible sections, and use synthetic test data. They are stored separately at `pr-screenshots/<number>/<commit>/` and remain embedded in the same bot comment after merge or closure. Production deployments and preview cleanup preserve these images. Retention has no automatic expiry; an operator can explicitly clean up stored screenshots later. Past closed PRs are not backfilled.

The publisher reconciles all current PR heads on every successful CI run or PR-close event, so concurrent events cannot discard another preview. Run the **Publish production and PR previews** workflow manually to retry a publication. Initial activation requires merging these workflows into `main` and a successful main CI run. Existing PRs need a new CI run using the updated workflow to upload their first `checked-site` artifact.

Production HTML permits indexing; every preview receives server-rendered `noindex, nofollow, noarchive, noimageindex` metadata. Crawling stays allowed so search engines can read `noindex`; blocking crawling with `robots.txt` can leave linked URLs indexed. Project Pages cannot set a separate host-root robots policy. Previews are public test URLs, are not linked from production, and are removed when PRs close. The existing public Worker configuration (`PUBLIC_INDEXING=true`) continues to permit indexing of the main hostname.

Preview publishing and archive tests use Python 3.10+ from the GitHub Ubuntu runner, with only standard-library modules. `npm run test:previews` also exercises generated-branch persistence and cleanup using a local temporary Git repository. Browser checks exercise the real combined production/preview build at desktop and mobile sizes.

Dependabot opens weekly npm and GitHub Action update pull requests. A weekly audit checks for newly disclosed dependency vulnerabilities even without source changes. Repository admins can require the CI jobs in a branch protection rule; workflows alone do not prevent direct pushes.

## Commons images and trusted approvals

The public reader supports Commons image candidates delivered through Nostr. When a NIP-07 signer is available, the reader tries to connect automatically. Trusted accounts see compact, unapproved image suggestions beside headlines as the cards enter the viewport. A headline such as “The Failures of Emmanuel Macron” searches Commons for “Emmanuel Macron”; this capitalization-based search hint is approximate and still needs human review. At most two automatic searches run together. Each suggestion says **Needs approval — only visible to trusted accounts**. Open **Review illustrative images** for alternatives or to refine the search. Stringer’s own account can choose **Publish and upvote image**, which requests two signatures: an image candidate, then an approval. Other trusted accounts can search and preview suggestions, and approve already-published candidates; publishing new candidates still requires Stringer’s account. Other readers discover signed candidates and approvals through the configured relays without a backend or news-manifest update. No image becomes public merely by searching or connecting. Disconnecting hides unapproved suggestions. A separate candidate publisher can also provide automated matches.

Image approvals use direct follows (`p` tags) in the latest verified kind-3 list from the configured Stringer public key. Stringer’s configured public key is also eligible directly, without following itself. Trust is not transitive. The list is read from the same configured relays as the news. No additional whitelist or private keys are stored by the site. A missing list disables approval for other accounts; an empty list leaves only Stringer’s own account eligible. Contact-list changes affect existing approvals immediately when received. All readers converge after receiving the same signed events; relay outages can temporarily produce different views.

The reader attempts NIP-07 connection once when the signer is detected, including delayed extension injection. Without NIP-07, no account controls or approval UI appear. The connected account displays its complete npub and a NIP-05 address only after verified kind-0 metadata and the domain’s HTTPS well-known mapping confirm the same public key; redirects are rejected. Stringer’s known root identifier is also checked if profile metadata is absent. Missing/unverifiable addresses are labeled unavailable, and they never change voting eligibility. Rejected signer access leaves a manual retry button without repeated automatic prompts. Disconnect clears account details; automatic connection never signs or publishes an event. Eligible readers can approve one candidate per news note, switch their choice, or withdraw. Everyone sees the candidate with the most active trusted approvals, with one approval sufficient. Ties favor the earliest active approving vote, then the lexically lowest candidate event ID. Changing a vote resets its approval time. Only the latest valid vote per author/story counts (latest timestamp, then lowest event ID). Votes are public, and are scoped to exact news-note IDs rather than URLs or clusters.

Automatic suggestions prefer the subject’s free representative image from Wikipedia, then a subject location map, with file metadata fetched and validated directly from Commons. Commons search supplies alternatives and remains available if the optional subject lookup fails. SVG source files are supported only through Commons-generated PNG thumbnails. Public-domain files without a `LicenseUrl` require all three explicit metadata values: `License=pd`, `Copyrighted=False`, and `UsageTerms=Public domain`; these use the canonical `PDM-1.0` link. Files with restrictions or missing attribution remain excluded. Search loading, empty and failure states appear beside the headline.

### Publisher contract (version 1)

The existing signed manifest optionally adds `imageCandidates: { "<news-note-id>": ["<candidate-event-id>"] }`. Only global publisher story IDs in that manifest are eligible, with one to five unique candidate IDs each. Invalid entries are ignored without rejecting the news. Removing a manifest-only candidate or its story from the manifest removes its image and eligibility; an obsolete vote is not transferred to a replacement news note. Existing manifests need no migration.

Each candidate is a kind-1 note signed by Stringer's configured publishing key, with human-readable `content` and exactly one root reference. Add the `t` tag below to make a candidate discoverable independently of the optional manifest map; its news-note ID must still belong to the current manifest:

```json
[
  ["e", "<news-note-id>", "", "root"],
  ["t", "stringer-image-v1"],
  ["stringer-image-v1", "<JSON metadata>"]
]
```

Metadata fields are `version: 1`, `url`, `filePage`, `title`, `alt`, `creator`, `attribution`, `license`, and `licenseUrl`. All text must be nonempty plain text, at most 2,000 characters per field. `url` must be an HTTPS image URL under `upload.wikimedia.org/wikipedia/commons/` or `thumb.wikimedia.org/wikipedia/commons/`; `filePage` must be an HTTPS `commons.wikimedia.org/wiki/File:` URL. Neither may contain credentials, nondefault ports, query strings or fragments. Serve a suitably sized thumbnail. No image bytes go into Nostr events.

Supported license identifiers are `CC0-1.0`, `PDM-1.0`, and `CC-BY-<version>` / `CC-BY-SA-<version>` for versions 1.0, 2.0, 2.5, 3.0 and 4.0. The HTTPS `creativecommons.org` license URL must match the identifier exactly (for example `https://creativecommons.org/licenses/by-sa/4.0/`). The candidate publisher must verify the Commons source, applicable license, attribution requirements, and subject relevance. It should leave uncertain matches absent and supply attribution text that preserves any required credit. The browser search uses Commons `imageinfo` / `extmetadata`, retains plain-text credits, skips unsupported file types/restrictions/incomplete licenses, canonicalizes known Creative Commons license URLs, and removes thumbnail tracking parameters. Search failures and empty results remain visible, and a user must choose the illustration’s relevance. The reader never fetches publisher article images. Independently indexed candidates remain discoverable while their news note is current; withdraw approvals to hide them.

### Vote contract (version 1)

A vote is a kind-1 note signed by the voting user's key, with human-readable `content` and these tags:

```json
[
  ["e", "<news-note-id>", "", "root"],
  ["t", "stringer-image-vote-v1"],
  ["stringer-image-vote-v1", "{\"version\":1,\"candidateId\":\"<candidate-event-id>\"}"]
]
```

Publish a newer vote with `candidateId: null` to withdraw. A new candidate ID changes the choice. The UI requires a later second than the previous vote, verifies the signer's returned event against the requested payload, and reports publication only after a configured relay accepts it. Signer refusal, account changes and relay failures leave the previous choice intact. Standard likes and unrelated replies do not count. A latest signed choice for an unavailable candidate contributes no approval and supersedes earlier choices; removing a candidate cannot resurrect an older vote.

The image session runs independently of headline loading. It fetches manifest-listed candidates by ID and independently indexed candidates by Stringer author, current news-note references and the candidate topic tag (up to 750 initial results), subscribes to the trust list and live votes, and loads latest-vote history through batches of 50 author/story filters with at most three history requests in flight and a six-second timeout. Signed image events are cached separately (up to 5 MB) and reverified on recovery; cached counts are never trusted. Cached approvals can be displayed offline, but voting by other accounts requires a current live trust-list response. Stringer’s own account does not depend on a self-follow or contact-list response. Sessions are disposed when the current news-note set or manifest candidate mapping changes, or the page closes.

Illustrations display Commons attribution, file and license links, and an explicit illustrative-image label. Publisher image metadata remains stripped, including in old snapshots; Stringer's approved photos remain separate. A failed Commons image leaves the headline readable.
