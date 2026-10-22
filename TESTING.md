# Frontend tests and coverage

Use Node 24 or newer and the pnpm version pinned in `package.json`, then install the pinned dependencies and Chromium:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps --only-shell chromium
pnpm run test:coverage
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

`pnpm test` runs the unit tests; `pnpm run test:browser` runs the static reader
browser tests; `pnpm run test:relay-browser` runs the relay integration test after
`pnpm run build`. The full coverage command also exercises loading, empty, failed,
partial, cached, and stale UI states at desktop and mobile sizes.

The coverage build enables inline source maps for measurement. Rebuild with
`pnpm run build` before publishing; ordinary builds omit those maps. Coverage
reports and temporary files stay outside the public `_site` artifact. CI runs
the enforced coverage command on Node 24 and 26 and checks the ordinary build's
public asset allowlist afterward.

In the managed macOS sandbox, Chromium may abort before the tests start. Run the
same tests with sandbox escalation; changing Chrome flags does not grant the
required filesystem access.

## PR coverage indicator

After the `PR coverage report` workflow is merged into the default branch, every
completed `Frontend coverage` run updates one bot comment on each matching open
PR. The comment shows all four metrics for Node 24 and 26 and links to the CI run
and annotated reports. Failed, cancelled, missing, expired, and malformed reports
are labelled explicitly. Superseded commits and closed PRs are skipped.

The reporting workflow uses default-branch code with read access to artifacts and
permission to comment on PRs. It reads only bounded numeric summary JSON from
ZIP artifacts and never extracts or executes PR code. Human comments are retained.
Its tests run with `pnpm run test:previews` and mock all GitHub writes.
