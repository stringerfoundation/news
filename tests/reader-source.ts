import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { fileURLToPath } from 'node:url';
// Browser fixtures exercise the same TypeScript compiler and public JS paths as the build.
export async function readerSource(file: string, edit: (source: string) => string = source => source): Promise<string> {
  const path = file.replace(/\.js$/, '.ts');
  const source = edit(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
  return (await transform(source, { loader: 'ts', format: 'esm', target: 'es2022',
    ...(process.env.NODE_V8_COVERAGE ? { sourcemap: 'inline', sourcefile: fileURLToPath(new URL(`../${path}`, import.meta.url)) } : {}) })).code;
}
