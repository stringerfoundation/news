import type { AtomstrSource } from '../relay/types.ts';

// Feed URLs and mirror keys were checked against the public active Atomstr catalogue on 2026-10-19.
// These are third-party Atomstr mirror accounts, not publisher-owned Nostr accounts; no remote registration was made.
const arabicSources: readonly AtomstrSource[] = Object.freeze([
  {
    id: 'ar-al-sharq',
    name: 'Al-Sharq',
    homepage: 'https://al-sharq.com',
    feeds: [{
      url: 'https://m.al-sharq.com/rss/latestNews',
      pubkey: '581bc12e8b87020171b942d22b5310301c20997ba854f72c760b41bb249f83b7',
    }],
  },
  {
    id: 'ar-cnn-arabic',
    name: 'CNN Arabic',
    homepage: 'https://arabic.cnn.com/',
    feeds: [{
      url: 'https://arabic.cnn.com/api/v1/rss/rss.xml',
      pubkey: 'f94b40ee732c54d3a3ac6e6c39410cb95c01b0ad31531c9226ab70f0e35bd561',
    }],
  },
]);

export default arabicSources;
