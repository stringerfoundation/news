import { stripTypeScriptTypes } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function check(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '_site', '.test-output', '.wrangler'].includes(entry.name)) continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (/\.(js|mjs|ts)$/.test(entry.name)) {
      const result = path.endsWith('.ts')
        ? spawnSync(process.execPath, ['--input-type=module', '--check'], {
          input: stripTypeScriptTypes(await readFile(path, 'utf8'), {mode: 'strip', sourceUrl: path}),
          stdio: ['pipe', 'inherit', 'inherit'],
        })
        : spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
await check('.');
