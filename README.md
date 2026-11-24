# Stringer News

Public source for the [Stringer news homepage](https://stringerjournalism.org/) and its [Android reader](android/README.md). The readers show global headlines with links to their original sources alongside reporting from Stringer journalists.

## Quick start

Use Node 24 or newer and the pnpm version pinned in [package.json](package.json).

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

The static web build is written to `_site/`.

## Documentation

- [Development](docs/development.md) and [testing](TESTING.md)
- [Hosting, deployment, CI, and PR previews](docs/deployment.md)
- [Language editions](docs/language-editions.md)
- [Illustrative images and editorial approvals](docs/illustrative-images.md)
- [Android releases](docs/android-releases.md)

Project code is [MIT licensed](LICENSE). See the [publication policy](LEGAL.md) for content rights and reuse permissions.
