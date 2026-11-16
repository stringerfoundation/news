import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const helper = path.resolve('scripts/android-release-metadata.sh');
const certificateFingerprint = '01'.repeat(32);

async function createFixture({
  apksignerOutput = `Signer #1 certificate SHA-256 digest: ${certificateFingerprint}`,
  apksignerExit = 0,
  packageId = 'org.stringerjournalism.news',
  versionCode = '42',
  versionName = '0.1.42',
}: {
  apksignerOutput?: string;
  apksignerExit?: number;
  packageId?: string;
  versionCode?: string;
  versionName?: string;
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'android-release-metadata-'));
  const bin = path.join(directory, 'bin');
  const apk = path.join(directory, 'app-release.apk');
  const output = path.join(directory, 'metadata');
  await mkdir(bin);
  await writeFile(apk, 'signed test apk bytes');
  const apksigner = path.join(bin, 'apksigner');
  await writeFile(apksigner, `#!/bin/sh\nprintf '%s\\n' '${apksignerOutput}'\nexit ${apksignerExit}\n`);
  await chmod(apksigner, 0o755);
  const aapt = path.join(bin, 'aapt');
  await writeFile(aapt, `#!/bin/sh\nprintf '%s\\n' "package: name='${packageId}' versionCode='${versionCode}' versionName='${versionName}'"\n`);
  await chmod(aapt, 0o755);
  return { directory, apk, bin, output };
}

function runHelper(fixture: Awaited<ReturnType<typeof createFixture>>, versionCode = '42') {
  return spawnSync('bash', [helper, fixture.apk, versionCode, 'a'.repeat(40), '1234', fixture.output], {
    env: { ...process.env, PATH: `${fixture.bin}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });
}

test('release metadata records the verified APK hash, source commit, and certificate fingerprint', async () => {
  const fixture = await createFixture();
  try {
    const result = runHelper(fixture);
    assert.equal(result.status, 0, result.stderr);

    const apkHash = createHash('sha256').update('signed test apk bytes').digest('hex');
    assert.equal(await readFile(path.join(fixture.output, 'app-release.apk.sha256'), 'utf8'), `${apkHash}  app-release.apk\n`);
    const provenance = await readFile(path.join(fixture.output, 'android-release-provenance.txt'), 'utf8');
    assert.match(provenance, /Version: 0\.1\.42/);
    assert.match(provenance, /Source commit: a{40}/);
    assert.match(provenance, new RegExp(`APK SHA-256: ${apkHash}`));
    assert.match(provenance, new RegExp(`APK signer certificate SHA-256: ${certificateFingerprint}`));
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('release metadata fails when apksigner cannot report a verified certificate fingerprint', async () => {
  const fixture = await createFixture({ apksignerOutput: 'APK signature did not verify' });
  try {
    const result = runHelper(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unable to read the verified APK signer certificate/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('release metadata fails when apksigner verification exits unsuccessfully', async () => {
  const fixture = await createFixture({ apksignerExit: 1 });
  try {
    const result = runHelper(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /apksigner signature verification failed/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('release metadata rejects a package ID mismatch', async () => {
  const fixture = await createFixture({ packageId: 'org.example.other' });
  try {
    const result = runHelper(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /APK package ID does not match/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('release metadata rejects version code and version name mismatches', async () => {
  const fixtures = [
    { options: { versionCode: '41' }, requestedVersion: '42', message: /APK versionCode does not match/ },
    { options: { versionName: '0.1.41' }, requestedVersion: '42', message: /APK versionName does not match/ },
  ];
  for (const entry of fixtures) {
    const fixture = await createFixture(entry.options);
    try {
      const result = runHelper(fixture, entry.requestedVersion);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, entry.message);
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  }
});

test('release metadata rejects a nonpositive or malformed version code', async () => {
  const fixture = await createFixture();
  try {
    const result = runHelper(fixture, '0x2a');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /VERSION_CODE must be a positive integer/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});
