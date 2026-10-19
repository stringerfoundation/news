import type { AtomstrSource } from '../relay/types.ts';

// Atomstr catalogue checked 2026-10-19. These are third-party mirrors, not publisher-owned Nostr accounts.
const dutchSources: readonly AtomstrSource[] = Object.freeze([
  {
    id: 'nl-nos-nieuws',
    name: 'NOS Nieuws',
    homepage: 'https://nos.nl',
    feeds: [{url: 'https://feeds.nos.nl/nosnieuwsalgemeen', pubkey: '64c524cd15c49f3ce10b8244bbef586f387a48e5ba76d48e71eecde0fd00ef22'}],
  },
  {
    id: 'nl-nu',
    name: 'NU.nl',
    homepage: 'https://www.nu.nl',
    feeds: [{url: 'https://www.nu.nl/rss', pubkey: 'd5769fade6ad4dd01cdb5ca9f6836474baf1ebd3713b9263661062c4951e9da1'}],
  },
  {
    id: 'nl-volkskrant',
    name: 'de Volkskrant',
    homepage: 'https://www.volkskrant.nl',
    feeds: [{url: 'https://www.volkskrant.nl/voorpagina/rss.xml', pubkey: 'c094a68dd8a38a1c8cd6c6c3e8cb11a0d37d6d9125a3e253808f42cf255c1359'}],
  },
  {
    id: 'nl-nos-voetbal',
    name: 'NOS Voetbal',
    homepage: 'https://nos.nl/voetbal',
    feeds: [{url: 'https://feeds.nos.nl/nosvoetbal', pubkey: 'e43d62c227a3622400bd2325345614dd87070bfcb3f6d49bf61427a76b8566fb'}],
  },
  {
    id: 'nl-voetbal-international-ajax',
    name: 'Voetbal International (Ajax)',
    homepage: 'https://www.vi.nl',
    feeds: [{url: 'https://www.vi.nl/feed/news.xml?tag=ajax', pubkey: '0be74b0dfd3c226e6c2f9076ce2c419a9e62d3ac228f499de2f4e04bac6650ce'}],
  },
  {
    id: 'nl-ajax1',
    name: 'Ajax1',
    homepage: 'https://www.ajax1.nl',
    feeds: [{url: 'https://www.ajax1.nl/feed/news.rss', pubkey: '4761e9e11f305b7e1c8bf2871151d238f2128e5d59a6938be67a7af384e97755'}],
  },
]);

export default dutchSources;
