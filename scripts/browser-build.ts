import type { Plugin } from 'esbuild';

// Preserve the public module URLs used by the static reader and proxy allowlist.
export const browserExternals: Plugin = {
  name: 'public-browser-modules',
  setup(builder) {
    const paths: Record<string, string> = {
      './news-model.ts': './news-model.js',
      './relay-config.ts': './relay-config.js',
      './stringer-media.ts': './stringer-media.js',
      './relay/reader.ts': './relay-reader.js',
      './relay/portuguese-reader.ts': './portuguese-reader.js',
    };
    builder.onResolve({filter: /^\.\//}, args => {
      const path = paths[args.path];
      return path ? {path, external: true} : undefined;
    });
  },
};
