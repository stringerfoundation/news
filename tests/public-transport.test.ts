
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import http, { IncomingMessage, type IncomingHttpHeaders, type RequestOptions } from 'node:http';
import { Socket } from 'node:net';
import type { lookup, LookupAddress, LookupAllOptions } from 'node:dns';
import https from 'node:https';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {gzipSync} from 'node:zlib';
import {publicFetch,createPublicLookup,decodeResponseBody,isPublicAddress} from '../scripts/public-fetch.ts';
interface TransportResponse {
  status?: number;
  headers?: IncomingHttpHeaders;
  body?: string | Buffer;
  failure?: boolean;
}

function transport(t: TestContext, {
  status = 200, headers = {}, body = 'Fixture response', failure = false,
}: TransportResponse = {}) {
  const calls: { url: URL; options: RequestOptions }[] = [];
  const request = (url: URL, options: RequestOptions, respond: (incoming: IncomingMessage) => void) => {
    calls.push({ url, options });
    const outgoing = new EventEmitter();
    return Object.assign(outgoing, {
      end() {
        setImmediate(() => {
          if (failure) {
            outgoing.emit('error', Error('Disconnected'));
            return;
          }
          const incoming = new IncomingMessage(new Socket());
          incoming.statusCode = status;
          incoming.headers = headers;
          incoming.push(typeof body === 'string' ? Buffer.from(body) : body);
          incoming.push(null);
          respond(incoming);
        });
      },
    });
  };
  t.mock.method(http, 'request', request);
  t.mock.method(https, 'request', request);
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return calls;
}
test('production transport handles public HTTP requests and header arrays',async t=>{
  const calls=transport(t,{headers:{'x-many':['a','b'],'x-empty':undefined,'content-type':'text/plain'}});
  const response=await publicFetch('http://example.org/');assert.equal(await response.text(),'Fixture response');assert.equal(response.headers.get('x-many'),'a, b');assert.equal(response.headers.get('x-empty'),null);assert.equal(calls[0]!.options.method,'GET');
});
test('HTTPS requests preserve supplied headers and cancellation signal',async t=>{
  const calls=transport(t);const signal=new AbortController().signal;await publicFetch(new Request('https://example.org/'),{headers:{accept:'text/plain'},signal});assert.equal(calls[0]!.options.signal,signal);assert.deepEqual(calls[0]!.options.headers,{accept:'text/plain'});
});
test('bodyless upstream statuses return empty responses',async t=>{
  for(const status of [204,205,304]){const sub=await t.test(String(status),async child=>{transport(child,{status});assert.equal((await publicFetch('https://example.org')).status,status);});void sub;}
});
test('upstream compressed bodies decode and remove stale encoding lengths',async t=>{
  transport(t,{headers:{'content-encoding':'gzip','content-length':'100'},body:gzipSync('Decoded response')});const response=await publicFetch('https://example.org');assert.equal(await response.text(),'Decoded response');assert.equal(response.headers.get('content-encoding'),null);assert.equal(response.headers.get('content-length'),null);
});
test('unsupported upstream encoding and socket errors reject the request',async t=>{
  await t.test('encoding',async child=>{transport(child,{headers:{'content-encoding':'unknown'}});await assert.rejects(publicFetch('https://example.org'),/Unsupported source encoding/);});
  await t.test('socket',async child=>{transport(child,{failure:true});await assert.rejects(publicFetch('https://example.org'),/Disconnected/);});
});
test('missing upstream status defaults to a bad gateway response',async t=>{
  const calls=transport(t);const original=http.request; t.mock.method(http,'request',(url: URL, options: RequestOptions, respond: (incoming: IncomingMessage) => void) => original(url, options, incoming => { delete incoming.statusCode; respond(incoming); }));syncBuiltinESMExports();assert.equal((await publicFetch('http://example.org')).status,502);assert.equal(calls.length,1);
});
test('lookup failures and empty DNS answers fail closed; single address returns vetted family',()=>{
  function withAnswer(error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) {
    // The transport requests only the all-address overload.
    const resolve = (_host: string, options: LookupAllOptions, callback: (failure: NodeJS.ErrnoException | null, records: LookupAddress[]) => void) => {
      assert.equal(options.all, true);
      callback(error, addresses);
    };
    return createPublicLookup(resolve as typeof lookup);
  }
  withAnswer(Error('DNS failed'), [])('example.org', {}, error => assert.match(error?.message ?? '', /DNS failed/));
  withAnswer(null, [])('example.org', {}, error => assert.match(error?.message ?? '', /Non-public/));
  withAnswer(null, [{ address: '8.8.8.8', family: 4 }])('example.org', {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, '8.8.8.8');
    assert.equal(family, 4);
  });
  assert.equal(isPublicAddress('invalid'),false);const body=Readable.from([]);assert.equal(decodeResponseBody(body,null),body);assert.equal(decodeResponseBody(body,'identity'),body);assert.throws(()=>decodeResponseBody(body,'unknown'),/Unsupported/);assert.ok(decodeResponseBody(Readable.from([gzipSync('body')]),'x-gzip'));
});
test('empty response bodies are valid empty text', async () => {
  const {readResponseText}=await import('../response.ts');assert.equal(await readResponseText(new Response(null)), '');
});
