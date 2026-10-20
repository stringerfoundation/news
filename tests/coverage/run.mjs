import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const run = (args, env = process.env) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
rmSync('.test-output/coverage/browser-sources', { recursive: true, force: true });
run(['--import', 'tsx', 'scripts/build.ts'], { ...process.env, STRINGER_BROWSER_COVERAGE: '1' });
run([
  '--import',
  'tsx',
  '--import',
  './tests/coverage/browser.mjs',
  '--test',
  '--test-concurrency=2',
  'tests/*.test.ts',
  'tests/*.test.mjs',
  'tests/relay/*.test.ts',
  'deploy/homepage-worker/worker.test.ts',
  'tests/browser.spec.ts',
  'tests/*.browser.mjs',
  'tests/*.browser.ts',
  'tests/relay/*.browser.ts',
  'tests/artifact/*.test.ts',
]);
