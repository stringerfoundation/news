import { spawnSync } from 'node:child_process';
const run = (args, env = process.env) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(['scripts/build.mjs'], { ...process.env, STRINGER_BROWSER_COVERAGE: '1' });
run([
  '--import',
  'tsx',
  '--import',
  './tests/coverage/browser.mjs',
  '--test',
  '--test-concurrency=2',
  'tests/*.test.mjs',
  'tests/relay/*.test.ts',
  'deploy/homepage-worker/worker.test.mjs',
  'tests/browser.spec.mjs',
  'tests/*.browser.mjs',
  'tests/relay/*.browser.ts',
  'tests/artifact/*.test.mjs',
]);
