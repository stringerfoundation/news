import { lookup } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable, pipeline } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
// Require globally routed IPv6; reject translation and special-use ranges too.
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001::', 23, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('3fff::', 20, 'ipv6');
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
export function publicUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    (isIP(host) && !isPublicAddress(host))) throw new Error('Non-public source destination');
  return url;
}
export function createPublicLookup(resolve: typeof lookup = lookup): LookupFunction {
  return (host, options, callback) => {
    resolve(host, { ...options, all: true }, (error, addresses) => {
      if (error) { callback(error, '', 4); return; }
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        callback(new Error('Non-public source destination'), '', 4); return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

export function decodeResponseBody(body: Readable, encoding: string | null): Readable {
  if (!encoding || encoding === 'identity') return body;
  const decoder = encoding === 'gzip' || encoding === 'x-gzip' ? createGunzip()
    : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
  if (!decoder) throw new Error('Unsupported source encoding');
  // Pipeline propagates failures and downstream cancellation to the socket.
  return pipeline(body, decoder, () => {});
}

// Validate DNS answers in the connection's own lookup callback: a second lookup
// cannot rebind an approved hostname to a private address between check and use.
export const publicFetch: typeof fetch = async (input, init = {}) => {
  const url = publicUrl(input instanceof Request ? input.url : String(input));
  return new Promise<Response>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', headers: Object.fromEntries(new Headers(init.headers)),
      ...(init.signal ? { signal: init.signal } : {}),
      lookup: createPublicLookup(),
    }, response => {
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
          else if (value !== undefined) headers.set(name, value);
        }
        const status = response.statusCode ?? 502;
        const noBody = [204, 205, 304].includes(status);
        if (noBody) response.resume();
        const encoding = headers.get('content-encoding')?.toLowerCase() ?? null;
        const body = noBody ? null : decodeResponseBody(response, encoding);
        if (encoding && encoding !== 'identity') {
          headers.delete('content-encoding'); headers.delete('content-length');
        }
        resolve(new Response(body ? Readable.toWeb(body) as ReadableStream<Uint8Array> : null, { status, headers }));
      } catch (error) { response.destroy(); reject(error); }
    });
    request.on('error', reject);
    request.end();
  });
};
