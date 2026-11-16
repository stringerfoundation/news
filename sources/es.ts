import type { AtomstrSource } from '../relay/types.ts';

// Active Atomstr URL/key pairs checked 2026-10-19; these are third-party mirrors.
export default [
  {
    "id": "es-el-pais",
    "name": "EL PAÍS",
    "homepage": "https://elpais.com",
    "feeds": [
      {
        "url": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada",
        "pubkey": "b9a8bce7b78fb5693b64fc6c84213f36bbbb96c5e4e3fe2f2b3648ae76a35f0e"
      },
      {
        "url": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/mexico/portada",
        "pubkey": "3fe9981716a32b978357861c7ebec316a78f6f6da22b2bf49ffa4707a9fb70d3"
      }
    ]
  },
  {
    "id": "es-ole",
    "name": "Olé — deportes",
    "homepage": "https://www.ole.com.ar",
    "feeds": [
      {
        "url": "https://www.ole.com.ar/rss/ultimas-noticias/",
        "pubkey": "fb61df746733b2df8dd2177b6b1e046cac6f39a372b45e5cc8019d5a6d2ff096"
      }
    ]
  }
] as const satisfies readonly AtomstrSource[];
