import test from 'node:test';
import assert from 'node:assert/strict';
import { readResponseText } from '../response.ts';

test('response limit counts UTF-8 bytes, preserves split characters, and cancels overflow', async () => {
  const bytes = new TextEncoder().encode('a€z');
  const response = () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 2)); controller.enqueue(bytes.slice(2)); controller.close();
  } }));
  assert.equal(await readResponseText(response(), 5), 'a€z');
  await assert.rejects(readResponseText(response(), 4), /too large/);
  let cancelled = false;
  let reads = 0;
  const infinite = new Response(new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(4)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readResponseText(infinite, 5), /too large/);
  assert.equal(cancelled, true);
  assert.ok(reads <= 3, 'stop consuming once the limit is reached');
});

test('oversized declared responses are cancelled and understated lengths cannot bypass the limit', async () => {
  let cancelled = false;
  const large = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': '100' } });
  await assert.rejects(readResponseText(large, 10), /too large/);
  assert.equal(cancelled, true);
  await assert.rejects(readResponseText(new Response('too long', { headers: { 'content-length': '1' } }), 2), /too large/);
});

test('stream failures propagate instead of accepting a truncated document', async () => {
  const failed = new Response(new ReadableStream({ start(controller) { controller.error(new Error('network interrupted')); } }));
  await assert.rejects(readResponseText(failed), /network interrupted/);
});
