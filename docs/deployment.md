# Hosting and deployment

GitHub Actions checks pull requests and pushes. Successful CI on `main` updates production at https://stringerfoundation.github.io/news/. Successful same-repository PR builds are published alongside production at `/news/pr-preview/<number>/`. Each PR receives one bot comment linking to its deployed preview and the checked commit.

The Cloudflare Worker in `deploy/homepage-worker/` serves `/` and `/news-assets/` from that Pages site. GET and HEAD requests to `/donate` (with or without a trailing slash) redirect to `https://stringerjournalism.org/get-involved`, preserving query attribution. Other paths and non-read requests continue to Hostinger. The separate news-subdomain Worker redirects visitors to the main homepage. GitHub Pages has no custom domain; the public website domains stay on Cloudflare and Hostinger.

The private collector and dashboard continue running independently on the operator's server. This repository contains only the public reader, public relay protocol and configuration, public assets, Worker code, and tests. Never add credentials, private keys, journalist CSV files, or databases.

## Worker configuration

Keep Wrangler configuration and Cloudflare account/zone details outside tracked source. Set `PAGES_ORIGIN=https://stringerfoundation.github.io/news/`, `PUBLIC_HOST=stringerjournalism.org`, and `PUBLIC_INDEXING=true`. Deploy as a Worker Route over the existing Hostinger DNS origin. Hostinger passthrough preserves methods, headers, bodies and queries. Pages requests omit visitor cookies and credentials. The Worker preserves the repository path in the Pages origin.

The Worker serves the apex Nostr identity endpoint directly. The existing news-subdomain redirect and identity handling remain independent. The GitHub Pages publisher uses its GitHub credentials.

### Homepage Worker CI

The homepage Worker workflow runs its routing tests and publishes a new `stringer-homepage` version when a push to `main` changes `deploy/homepage-worker/worker.ts`, `public-assets.ts`, or `relay-config.ts`. Update its trigger and diff checks when the Worker gains another local runtime import. The version upload uses the existing Worker variables and the release uses the existing route.

Allow `main` in the GitHub `cloudflare-homepage-worker` environment. Set `CLOUDFLARE_ACCOUNT_ID` to the account that owns the Worker and `CLOUDFLARE_API_TOKEN` to a token with Editor access to `stringer-homepage`. Keep production bindings and routing in private operator configuration.

To roll back the Pages origin, restore the previous `PAGES_ORIGIN` in private operator configuration and redeploy the Worker. Disabling the homepage route restores Hostinger's original homepage.

### Cloudflare Pages Direct Upload

The Cloudflare Pages workflow uploads the checked public artifact after the website CI workflow succeeds on `main`. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_PAGES_PROJECT` as secrets in the GitHub `cloudflare-pages` environment. Allow the `main` branch in that environment and grant the token Cloudflare Pages Edit access to the account that owns the Direct Upload project. A push or a manual run of the website workflow on `main` can deploy the checked build.

## Continuous integration

Every pull request and push to `main` runs syntax and lint checks, strict TypeScript checks for all maintained source, unit tests on Node 24 and 26, signed-event security tests, workflow lint, a redacted Git history secret scan, dependency auditing, and CodeQL security analysis. A separate browser job builds the public artifact and verifies its exact allowlist, relative assets, content versions, and production indexing metadata before running desktop/mobile browser regressions, including relay streaming, a silent relay, missing notes, and offline cache recovery. Test fixtures are synthetic and never publish events.

The browser job uploads its checked public assets as a `checked-site` artifact. A separate publisher (`previews.yml`) runs only trusted `main` code, verifies successful CI provenance and current commit heads, and treats PR archives as data. It rejects unknown files, traversal, links, oversized archives, and incomplete builds. PR builds have no deployment permissions; fork PRs are tested but are not automatically published on the production origin. Actions use immutable commit pins and checkout does not persist credentials. Worker deployment remains a separate operator action.

Dependabot opens weekly pnpm and GitHub Action update pull requests. A weekly audit checks for newly disclosed dependency vulnerabilities even without source changes. Repository admins can require the CI jobs in a branch protection rule; workflows alone do not prevent direct pushes.

## PR previews

The generated `pages-state` branch in this same repository holds the last checked production build, active previews, and deployment metadata. Only its `site/` directory is uploaded to Pages. A PR update replaces its own preview; a production update preserves all active previews. Closing or merging a PR removes its preview and updates the bot comment after the combined Pages deployment succeeds. Failed or pending CI retains the previous preview, whose comment identifies the actual checked commit. Generated state survives CI artifact expiry. Adding public asset names requires updating both the artifact-test and trusted publisher allowlists.

Automated mobile, tablet, and desktop screenshots are published only for PRs whose full diff changes reader HTML/CSS, browser JavaScript/TypeScript, or visual assets. Documentation, tests, tooling, and CI-only PRs still run browser checks but do not publish screenshots. Images are shown directly in the PR comment, without collapsible sections, and use synthetic test data. They are stored separately at `pr-screenshots/<number>/<commit>/` and remain embedded in the same bot comment after merge or closure. Production deployments and preview cleanup preserve these images. Retention has no automatic expiry; an operator can explicitly clean up stored screenshots later. Past closed PRs are not backfilled.

The publisher reconciles all current PR heads on every successful CI run or PR-close event, so concurrent events cannot discard another preview. Run the **Publish production and PR previews** workflow manually to retry a publication. Initial activation requires merging these workflows into `main` and a successful main CI run. Existing PRs need a new CI run using the updated workflow to upload their first `checked-site` artifact.

GitHub Pages production and previews carry `noindex, nofollow, noarchive, noimageindex` metadata and a project-level `robots.txt` with `Disallow: /`. Crawlers read `/robots.txt` at the hostname root, which is controlled by the organization’s GitHub Pages site. The homepage Worker strips the upstream robots metadata when `PUBLIC_INDEXING=true` on the public hostname. The homepage and its language editions use same-origin links and share assets under `/news-assets/`.

Preview publishing and archive tests use Python 3.10+ from the GitHub Ubuntu runner, with only standard-library modules. `pnpm run test:previews` also exercises generated-branch persistence and cleanup using a local temporary Git repository. Browser checks exercise the real combined production/preview build at desktop and mobile sizes.
