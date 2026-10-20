import { fileURLToPath } from 'node:url';
import { browserExternals } from '../scripts/browser-build.ts';
import { readFile } from 'node:fs/promises';
import { transform, build } from 'esbuild';
// Browser fixtures exercise the same TypeScript compiler and public JS paths as the build.
export async function readerSource(file: string, edit: (source: string) => string = source => source): Promise<string> {
  const path = file.replace(/\.js$/, '.ts');
  const sourcefile = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const source = edit(await readFile(sourcefile, 'utf8'));
  const coverage = process.env.NODE_V8_COVERAGE ? {sourcemap: 'inline' as const} : {};
  if (file === 'app.js') {
    const result = await build({stdin: {contents: source, sourcefile, loader: 'ts', resolveDir: fileURLToPath(new URL('../', import.meta.url))}, outfile: fileURLToPath(new URL('../_site/app.js', import.meta.url)), bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', plugins: [browserExternals], ...coverage});
    return result.outputFiles![0]!.text;
  }
  return (await transform(source, { loader: 'ts', format: 'esm', target: 'es2022', sourcefile, ...coverage })).code;
}
