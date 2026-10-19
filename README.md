# Stringer website

Public source for the news homepage at https://stringerjournalism.org/.

## Hosting

GitHub Actions checks pull requests and pushes. A successful push to `main` publishes only the `_site` asset allowlist to GitHub Pages at https://stringerfoundation.github.io/stringer-news/.

The Cloudflare Worker in `deploy/homepage-worker/` serves `/` and `/news-assets/` from that Pages site. Other paths and form requests continue to Hostinger. The separate news-subdomain Worker redirects visitors to the main homepage. GitHub Pages has no custom domain; the public website domains stay on Cloudflare and Hostinger.

The private collector and dashboard continue running independently on the operator's server. This repository contains only the public reader, public relay protocol and configuration, public assets, Worker code, and tests. Never add credentials, private keys, journalist CSV files, or databases.

## Development

All application, relay, build, worker and test source is TypeScript, checked with strict `tsc` settings. Node runs erasable TypeScript directly; esbuild emits the public JavaScript modules into `_site`. Source files and development tooling are excluded from the published asset allowlist. Private Wrangler configuration should point to `deploy/homepage-worker/worker.ts` or `deploy/news-redirect/worker.ts`.

Use Node 24 or newer:

```sh
npm ci
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

The reader loads verified news from the configured Nostr relays. CI uses synthetic fixtures; it does not publish or collect news. Global publishers supply headlines, attribution, dates and original links; Stringer reporting and photos remain separate. See `LEGAL.md` for the publication policy. Source availability does not grant reuse rights to publisher material or photographs.

## Worker configuration

Keep Wrangler configuration and Cloudflare account/zone details outside tracked source. Set `PAGES_ORIGIN=https://stringerfoundation.github.io/stringer-news/`, `PUBLIC_HOST=stringerjournalism.org`, and `PUBLIC_INDEXING=true`. Deploy as a Worker Route over the existing Hostinger DNS origin. Hostinger passthrough preserves methods, headers, bodies and queries. Pages requests omit visitor cookies and credentials. The Worker preserves the repository path in the Pages origin.

The Worker serves the apex Nostr identity endpoint directly. The existing news-subdomain redirect and identity handling remain independent. Worker deployment is a separate operator action; frontend updates deploy automatically through GitHub Actions without a Cloudflare token in GitHub.

To roll back the Pages origin, restore the previous `PAGES_ORIGIN` in private operator configuration and redeploy the Worker. Disabling the homepage route restores Hostinger's original homepage.

## License

Original project code is licensed under the [MIT License](LICENSE). This license does not grant rights to Stringer names, trademarks, logos, reporting, photographs, or third-party content. Those materials retain their respective rights and permissions; see `LEGAL.md`. Dependency licenses remain applicable.

## Language editions

The Pages build includes `/fr/` (French), `/es/` (Spanish), `/ar/` (Arabic), `/zh/` (Simplified Chinese), `/ru/` (Russian), `/nl/` (Dutch), and `/de/` (German). These editions use the same global publisher headlines as the English reader. Arabic uses a right-to-left interface; story text keeps its original direction.

It also includes `/br/` (Brazilian Portuguese) and `/pt/` (European Portuguese), sharing the pinned catalogue in `portuguese-sources.ts`. On the project site these resolve beneath `/stringer-news/`. The edition links and shared assets remain relative. The locale pages preserve the same UTC build stamp as the English reader.

These editions translate the interface only; headlines and Stringer reporting remain in their original languages. Portuguese headlines are read directly from the configured Atomstr relay and require both a pinned mirror signature and matching RSS provenance. Publisher summaries and photos are discarded. Mirror timestamps and social-feed fallbacks are labeled, and unavailable mirrors retain previously verified stories without claiming a successful refresh. BR and PT share source choices in browser storage; the English reader continues to enable every publisher.

Run `npm run build`, `npm test`, and `npm run test:browser` to check the generated pages and browser behavior. Locale routes are available on GitHub Pages after merge and deployment. This change does not activate them through the live Cloudflare Worker; its routing remains an independent operator action.
