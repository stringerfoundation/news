export const collectedSwahiliPublishers = [
  {id: 'sw-rfi', name: 'RFI Kiswahili', url: 'https://www.rfi.fr/sw/rss', articleHosts: ['www.rfi.fr']},
  {id: 'sw-habarileo', name: 'HabariLeo', url: 'https://habarileo.co.tz/feed/', articleHosts: ['habarileo.co.tz', 'www.habarileo.co.tz']},
  {id: 'sw-bbc', name: 'BBC News Swahili', url: 'https://feeds.bbci.co.uk/swahili/rss.xml', articleHosts: ['www.bbc.com', 'www.bbc.co.uk']},
  {id: 'sw-voa', name: 'VOA Swahili', url: 'https://www.voaswahili.com/api/z-_ktl-vomx-tperr-r', articleHosts: ['www.voaswahili.com']},
] as const;

// The user authorized headline and link display for these publisher feeds.
export const SWAHILI_CONTENT_PERMISSIONS = Object.freeze(Object.fromEntries(
  collectedSwahiliPublishers.map(source => [source.id, Object.freeze({text: true, summaries: false, images: false})]),
));
