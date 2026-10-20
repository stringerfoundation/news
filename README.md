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

The publisher reconciles all current PR heads on every successful CI run or PR-close event, so concurrent events cannot discard another preview. Run the **Publish production and PR previews** workflow manually to retry a publication. Initial activation requires merging these workflows into `main` and a successful main CI run. Existing PRs need a new CI run using the updated workflow to upload their first `checked-site` artifact.

Production HTML permits indexing; every preview receives server-rendered `noindex, nofollow, noarchive, noimageindex` metadata. Crawling stays allowed so search engines can read `noindex`; blocking crawling with `robots.txt` can leave linked URLs indexed. Project Pages cannot set a separate host-root robots policy. Previews are public test URLs, are not linked from production, and are removed when PRs close. The existing public Worker configuration (`PUBLIC_INDEXING=true`) continues to permit indexing of the main hostname.

Preview publishing and archive tests use Python 3.10+ from the GitHub Ubuntu runner, with only standard-library modules. `npm run test:previews` also exercises generated-branch persistence and cleanup using a local temporary Git repository. Browser checks exercise the real combined production/preview build at desktop and mobile sizes.

Dependabot opens weekly npm and GitHub Action update pull requests. A weekly audit checks for newly disclosed dependency vulnerabilities even without source changes. Repository admins can require the CI jobs in a branch protection rule; workflows alone do not prevent direct pushes.
