import type { AtomstrSource } from '../relay/types.ts';

// Atomstr catalogue checked 2026-10-19. These are third-party mirrors, not publisher-owned Nostr accounts.
const germanSources: readonly AtomstrSource[] = Object.freeze([
  {
    id: 'de-dw',
    name: 'Deutsche Welle',
    homepage: 'https://www.dw.com/de/',
    feeds: [{url: 'https://rss.dw.com/atom/rss-de-all', pubkey: 'e2a619c564c63c393c8810f7d46f3753c354499b7126f40a61b6d4df1744bcfb'}],
  },
  {
    id: 'de-tagesschau',
    name: 'tagesschau',
    homepage: 'https://www.tagesschau.de',
    feeds: [{url: 'https://www.tagesschau.de/xml/rss2/', pubkey: 'c6b6286f7df60c5f3d16300fb4faec90f4d91e175e0025206a905e17f290d3f3'}],
  },
  {
    id: 'de-sueddeutsche-zeitung',
    name: 'Süddeutsche Zeitung',
    homepage: 'https://www.sueddeutsche.de',
    feeds: [{url: 'https://rss.sueddeutsche.de/rss/Alles', pubkey: '3b53d7c142cf0ca909961432b30c5195a14b9d424ee97b401b584b26e04f1f23'}],
  },
  {
    id: 'de-berliner-zeitung',
    name: 'Berliner Zeitung',
    homepage: 'https://www.berliner-zeitung.de',
    feeds: [{url: 'https://www.berliner-zeitung.de/feed.xml', pubkey: '52578b56008fb9a47104810402b74bc2a92b9c9cce01889c84cb5dd1fb177484'}],
  },
  {
    id: 'de-rp-online',
    name: 'RP ONLINE',
    homepage: 'https://rp-online.de',
    feeds: [{url: 'https://rp-online.de/feed.rss', pubkey: 'a5806aaac8559e8de88812e639ad037cfc8e9348956ac6512dc7e10d497c3f5e'}],
  },
  {
    id: 'de-hessenschau-rhein-main',
    name: 'hessenschau Rhein-Main',
    homepage: 'https://www.hessenschau.de',
    feeds: [{url: 'https://www.hessenschau.de/rheinmain/index.rss', pubkey: '4212138cd2a0d789ee47140675a16969badf79fb8ac722a0e6dfe2c70802ba44'}],
  },
]);

export default germanSources;
