# Stringer website

Public source for the news homepage at https://stringerjournalism.org/.

## Hosting

GitHub Actions checks pull requests and pushes. A successful push to `main` publishes only the `_site` asset allowlist to GitHub Pages at https://stringerfoundation.github.io/stringer-news/.

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
npm run build
npm run test:artifact
npx playwright install chromium
npm run test:browser
npm run test:relay-browser
```

The reader UI (`app.ts`), news model (`news-model.ts`), approved media catalogue (`stringer-media.ts`), public configuration (`relay-config.ts`), and relay implementation are TypeScript, checked together with strict compiler settings. `npm run build` compiles them to the existing relative JavaScript asset paths in `_site`; TypeScript sources, declarations, and source maps are excluded from the published allowlist. Tests load source modules through `tsx`; browser fixtures compile their source with esbuild. Node build scripts and Worker infrastructure remain JavaScript.

The reader loads verified news from the configured Nostr relays. CI uses synthetic fixtures; it does not publish or collect news. Global publishers supply headlines, attribution, dates and original links; Stringer reporting and photos remain separate. See `LEGAL.md` for the publication policy. Source availability does not grant reuse rights to publisher material or photographs.

## Worker configuration

Keep Wrangler configuration and Cloudflare account/zone details outside tracked source. Set `PAGES_ORIGIN=https://stringerfoundation.github.io/stringer-news/`, `PUBLIC_HOST=stringerjournalism.org`, and `PUBLIC_INDEXING=true`. Deploy as a Worker Route over the existing Hostinger DNS origin. Hostinger passthrough preserves methods, headers, bodies and queries. Pages requests omit visitor cookies and credentials. The Worker preserves the repository path in the Pages origin.

The Worker serves the apex Nostr identity endpoint directly. The existing news-subdomain redirect and identity handling remain independent. Worker deployment is a separate operator action; frontend updates deploy automatically through GitHub Actions without a Cloudflare token in GitHub.

To roll back the Pages origin, restore the previous `PAGES_ORIGIN` in private operator configuration and redeploy the Worker. Disabling the homepage route restores Hostinger's original homepage.

## License

Original project code is licensed under the [MIT License](LICENSE). This license does not grant rights to Stringer names, trademarks, logos, reporting, photographs, or third-party content. Those materials retain their respective rights and permissions; see `LEGAL.md`. Dependency licenses remain applicable.

## Continuous integration

Every pull request and push to `main` runs syntax and lint checks, strict reader and relay TypeScript checks, unit tests on Node 24 and 26, signed-event security tests, workflow lint, a redacted Git history secret scan, dependency auditing, and CodeQL security analysis. A separate browser job builds the public artifact and verifies its exact allowlist, relative assets, content versions, and noindex controls before running desktop/mobile browser regressions, including relay streaming, a silent relay, missing notes, and offline cache recovery. Test fixtures are synthetic and never publish events.

GitHub Pages deployment waits for every CI job to succeed, and only publishes the browser job's checked `_site` artifact from `main`. Pull requests have no deployment permissions. CI actions use immutable commit pins, and checkout does not persist credentials. There is no Cloudflare deployment in these workflows.

Dependabot opens weekly npm and GitHub Action update pull requests. A weekly audit checks for newly disclosed dependency vulnerabilities even without source changes. Repository admins can require the CI jobs in a branch protection rule; workflows alone do not prevent direct pushes.
