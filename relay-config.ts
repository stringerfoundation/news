import type { ReaderConfig } from './relay/reader.js';
// Public reader configuration; no private keys.
const config = { enabled: true, pubkey: "b8225dbedf6ae7949e880e7979e975d8e6f238f32d318bc4a562ecb198fcd707", relays: ['wss://relay.nos.social', 'wss://nos.lol', 'wss://relay.damus.io'] } satisfies ReaderConfig & { enabled: boolean };
export default config;
