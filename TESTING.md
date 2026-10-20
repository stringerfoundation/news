# Frontend tests and coverage

Use Node 24 or newer, then install the pinned dependencies and Chromium:

```sh
npm ci
npx playwright install --with-deps --only-shell chromium
npm run test:coverage
```

The coverage command builds the reader, runs the unit, signed-relay, browser,
and artifact tests, and combines Node and Chromium V8 coverage. Reports are
written to `.test-output/coverage/`; open `index.html` for annotated source.
The command requires 100% statements, branches, functions, and lines for every
source file. Missing files count as untested.

Coverage includes the browser app and data model, relay implementation, worker
entry points, and development scripts. Tests, third-party dependencies, the
ESLint configuration, and TypeScript declarations are outside the source scope.
Browser coverage is accepted only when the executed script matches the real
source; mocked relay modules used in UI contract tests do not contribute.
The relay bundle's source map attributes browser execution to the original
TypeScript. Synthetic fixtures exercise relays without publishing any events.

`npm test` runs the unit tests; `npm run test:browser` runs the static reader
browser tests; `npm run test:relay-browser` runs the relay integration test after
`npm run build`. The full coverage command also exercises loading, empty, failed,
partial, cached, and stale UI states at desktop and mobile sizes.

The coverage build enables inline source maps for measurement. Rebuild with
`npm run build` before publishing; ordinary builds omit those maps. Coverage
reports and temporary files stay outside the public `_site` artifact. CI runs
the enforced coverage command on Node 24 and 26 and checks the ordinary build's
public asset allowlist afterward.

In the managed macOS sandbox, Chromium may abort before the tests start. Run the
same tests with sandbox escalation; changing Chrome flags does not grant the
required filesystem access.
