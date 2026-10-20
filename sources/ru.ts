import type { AtomstrSource } from '../relay/types.ts';

// Atomstr catalogue checked 2026-10-19. These are third-party mirrors, not publisher-owned Nostr accounts.
const russianSources: readonly AtomstrSource[] = Object.freeze([
  {
    id: 'ru-novaya-gazeta',
    name: 'Новая газета',
    homepage: 'https://novayagazeta.ru',
    feeds: [{url: 'https://novayagazeta.ru/feed/rss', pubkey: '24f987722ee5b75bc04350a48ec505f2723b8456acfe20db2bb02196fddbd4fa'}],
  },
  {
    id: 'ru-ria-novosti',
    name: 'РИА Новости',
    homepage: 'https://ria.ru',
    feeds: [{url: 'https://ria.ru/export/rss2/archive/index.xml', pubkey: 'cfef013a4a8cc320eb60d81ee5684608221e3101eecda62cebcf68acbe1daa39'}],
  },
  {
    id: 'ru-vedomosti',
    name: 'Ведомости',
    homepage: 'https://www.vedomosti.ru',
    feeds: [{url: 'https://www.vedomosti.ru/rss/news.xml', pubkey: 'f0e8d99e36fad8ff9d11f2f277a4efbff29cf50eb2c34ff3a7e04717029bb0e0'}],
  },
  {
    id: 'ru-tass',
    name: 'ТАСС',
    homepage: 'https://tass.ru',
    feeds: [{url: 'https://tass.ru/rss/v2.xml', pubkey: '43e738e29cf99e05ee3861df4e904368747044b0e98153edb54d1dea6402a7be'}],
  },
  {
    id: 'ru-interfax',
    name: 'Интерфакс',
    homepage: 'https://www.interfax.ru',
    feeds: [{url: 'https://www.interfax.ru/rss.asp', pubkey: '331146863daf49431309b7ab8b1eb9ae7abc9156add9120251c822e115a2592b'}],
  },
]);

export default russianSources;
