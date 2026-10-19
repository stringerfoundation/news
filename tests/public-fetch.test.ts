import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, publicUrl, publicFetch } from '../scripts/public-fetch.ts';
import { fetchText } from '../scripts/collect.ts';

test('collector blocks private, local, mapped, and non-public IP destinations', () => {
  for (const address of ['0.0.0.0', '127.0.0.1', '10.2.3.4', '172.16.1.1', '192.168.1.2',
    '100.64.0.1', '169.254.169.254', '224.0.0.1', '::', '::1', '::ffff:127.0.0.1',
    'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::', '64:ff9b::7f00:1'])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(address), true);
  for (const url of ['http://2130706433/', 'http://0x7f000001/', 'http://[::ffff:127.0.0.1]/',
    'http://localhost./', 'http://test.local/', 'http://x.localhost/', 'file:///etc/passwd', 'https://user:pass@example.org/'])
    assert.throws(() => publicUrl(url), /Non-public/);
});

test('production transport rejects a private literal without opening a connection', async () => {
  await assert.rejects(publicFetch('http://127.0.0.1/'), /Non-public/);
});

test('metadata redirects cannot reach private destinations and cancelled bodies release connections', async () => {
  const requested: string[] = [];
  let cancelled = false;
  await assert.rejects(fetchText('https://example.org/story', { attempts: 1, fetchImpl: async (url, options) => {
    requested.push(String(url));
    assert.equal(options?.redirect, 'manual');
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    });
  } }), /Non-public/);
  assert.deepEqual(requested, ['https://example.org/story']);
  assert.equal(cancelled, true);
});

test('public redirects share a deadline and terminate redirect loops', async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  await assert.rejects(fetchText('https://example.org/story', { attempts: 1, fetchImpl: async (_url, options) => {
    signals.push(options?.signal);
    return new Response(null, { status: 302, headers: { location: '/loop' } });
  } }), /redirect blocked/);
  assert.equal(signals.length, 4);
  assert.ok(signals[0]);
  assert.ok(signals.every(signal => signal === signals[0]));
});

test('connection lookup rejects mixed public/private DNS answers and returns vetted answers without a second lookup', async () => {
  const { createPublicLookup } = await import('../scripts/public-fetch.ts');
  type Resolver = Parameters<typeof createPublicLookup>[0];
  const resolve = (addresses: { address: string; family: number }[]) => {
    let calls = 0;
    const resolver = ((_host: string, _options: unknown, callback: (error: Error | null, addresses: { address: string; family: number }[]) => void) => {
      calls++;
      callback(null, addresses);
    }) as Resolver;
    return { lookup: createPublicLookup(resolver), calls: () => calls };
  };
  const mixed = resolve([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  mixed.lookup('example.org', { all: true }, error => assert.match(String(error), /Non-public/));
  assert.equal(mixed.calls(), 1);
  const publicAnswers = [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }];
  const allowed = resolve(publicAnswers);
  allowed.lookup('example.org', { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, publicAnswers);
  });
  assert.equal(allowed.calls(), 1);
});

test('compressed responses are decoded before enforcing byte limits', async () => {
  const { Readable } = await import('node:stream');
  const { gzipSync, deflateSync, brotliCompressSync } = await import('node:zlib');
  const { decodeResponseBody } = await import('../scripts/public-fetch.ts');
  const { readResponseText } = await import('../response.ts');
  const content = 'compressed text '.repeat(100);
  for (const [encoding, compress] of [['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]] as const) {
    const response = () => new Response(Readable.toWeb(decodeResponseBody(Readable.from([compress(content)]), encoding)) as ReadableStream<Uint8Array>);
    assert.equal(await readResponseText(response()), content);
    await assert.rejects(readResponseText(response(), 100), /too large/);
  }
  const invalid = decodeResponseBody(Readable.from([Buffer.from('invalid compressed data')]), 'gzip');
  await assert.rejects(readResponseText(new Response(Readable.toWeb(invalid) as ReadableStream<Uint8Array>)));
});
