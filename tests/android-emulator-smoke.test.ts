import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

async function smokeFixture(failInstrumentation: boolean) {
  const directory = await mkdtemp(join(tmpdir(), 'android smoke-'));
  const trace = join(directory, 'trace');
  const bin = join(directory, 'bin');
  await mkdir(bin);
  await mkdir(join(directory, 'scripts'));
  await mkdir(join(directory, 'android'));
  await copyFile(resolve('scripts/android-emulator-smoke.sh'), join(directory, 'scripts', 'android-emulator-smoke.sh'));
  const gradle = join(directory, 'android', 'gradlew');
  await writeFile(gradle, '#!/bin/sh\nprintf "build:%s\\n" "$ANDROID_VERSION_CODE" >> "$SMOKE_TRACE"\n');
  await chmod(gradle, 0o755);
  const adb = join(bin, 'adb');
  await writeFile(adb, `#!/bin/sh
printf '%s\\n' "$*" >> "$SMOKE_TRACE"
case "$*" in
  *'am instrument'*)
    if [ "$SMOKE_FAIL" = yes ]; then printf 'FAILURES!!!\\nTests run: 1, Failures: 1\\n'; else printf 'OK (1 test)\\n'; fi
    ;;
  *'dumpsys package'*) printf 'versionCode=2 minSdk=26 targetSdk=35\\n' ;;
esac
exit 0
`);
  await chmod(adb, 0o755);
  return {
    directory, trace,
    run: () => spawnSync('bash', [join(directory, 'scripts', 'android-emulator-smoke.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SMOKE_TRACE: trace, SMOKE_FAIL: failInstrumentation ? 'yes' : 'no' },
    }),
  };
}

test('emulator smoke runs both installed versions and verifies data after replacement', async () => {
  const fixture = await smokeFixture(false);
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const trace = await readFile(fixture.trace, 'utf8');
    assert.match(trace, /build:1[\s\S]*UpgradePersistenceTest#seed[\s\S]*build:2[\s\S]*install -r[\s\S]*UpgradePersistenceTest#verify/);
    assert.doesNotMatch(trace, /uninstall|pm clear/);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test('a failed instrumentation result stops upgrades even when adb exits zero', async () => {
  const fixture = await smokeFixture(true);
  try {
    const result = fixture.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /FAILURES/);
    assert.doesNotMatch(await readFile(fixture.trace, 'utf8'), /build:2|UpgradePersistenceTest#verify/);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});
