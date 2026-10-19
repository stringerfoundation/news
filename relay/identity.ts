import { SimplePool } from 'nostr-tools/pool';
import { npubEncode } from 'nostr-tools/nip19';
import type { Event } from 'nostr-tools';
import { checkedEvent } from './protocol.js';
import { newest } from './images.js';
export { npubEncode };

export function profileAddress(events: Event[], pubkey: string): string | null {
  const valid = events.filter(event => {
    try { checkedEvent(event, pubkey, 0); return true; } catch { return false; }
  }).sort(newest);
  if (!valid[0]) return null;
  try {
    const metadata = JSON.parse(valid[0].content) as { nip05?: unknown };
    return typeof metadata.nip05 === 'string' ? metadata.nip05 : null;
  } catch { return null; }
}
export function nip05Endpoint(address: string): { url: string; name: string; address: string } | null {
  const match = /^([a-z0-9._-]+)@([a-z0-9.-]+)$/i.exec(address);
  if (!match) return null;
  const name = match[1]!, domain = match[2]!.toLowerCase();
  if (address.length > 320 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
      /\.(local|localhost|internal|home|lan)$/.test(domain)) return null;
  const url = new URL(`https://${domain}/.well-known/nostr.json`);
  url.searchParams.set('name', name);
  return { url: url.href, name, address: name === '_' ? domain : `${name}@${domain}` };
}
export async function verifyAddress(address: string, pubkey: string, request: typeof fetch = fetch): Promise<string | null> {
  const endpoint = nip05Endpoint(address);
  if (!endpoint) return null;
  try {
    const response = await request(endpoint.url, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const body = await response.json() as { names?: Record<string, unknown> };
    const names = body?.names;
    return names && typeof names === 'object' && !Array.isArray(names) && Object.hasOwn(names, endpoint.name) && names[endpoint.name] === pubkey ? endpoint.address : null;
  } catch { return null; }
}
/** Profile resolution is independent of headline loading and voting eligibility. */
export async function readIdentity(pubkey: string, relays: string[], fallback?: string): Promise<string | null> {
  const pool = new SimplePool({ enableReconnect: false });
  const events: Event[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let subscription: ReturnType<SimplePool['subscribeMany']> | undefined;
  try {
    await new Promise<void>(resolve => {
      timer = setTimeout(resolve, 4500);
      subscription = pool.subscribeMany(relays, { kinds: [0], authors: [pubkey], limit: 3 }, {
        maxWait: 3500, onevent: event => { events.push(event); }, oneose: resolve, onclose: () => resolve(),
      });
    });
  } finally {
    clearTimeout(timer);
    await subscription?.close();
    pool.destroy();
  }
  const claimed = profileAddress(events, pubkey);
  const verified = claimed ? await verifyAddress(claimed, pubkey) : null;
  return verified || (fallback && fallback !== claimed ? await verifyAddress(fallback, pubkey) : null);
}
