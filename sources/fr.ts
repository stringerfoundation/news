import type { AtomstrSource } from '../relay/types.ts';

// Active Atomstr URL/key pairs checked 2026-10-19; these are third-party mirrors.
export default [
  {
    "id": "fr-le-monde",
    "name": "Le Monde",
    "homepage": "https://www.lemonde.fr",
    "feeds": [
      {
        "url": "https://www.lemonde.fr/rss/une.xml",
        "pubkey": "71b09828e771b5342ce6b86e69d7e55d33bbb8b00f1f80c2257b6d4c3dca8bc5"
      }
    ]
  },
  {
    "id": "fr-franceinfo",
    "name": "franceinfo",
    "homepage": "https://www.francetvinfo.fr",
    "feeds": [
      {
        "url": "https://www.francetvinfo.fr/titres.rss",
        "pubkey": "211dd9b4482d7869b6c55b88828e7e66ecc1127890e0a9fa14c594fd9fff0558"
      }
    ]
  },
  {
    "id": "fr-le-figaro",
    "name": "Le Figaro",
    "homepage": "https://www.lefigaro.fr",
    "feeds": [
      {
        "url": "https://www.lefigaro.fr/rss/figaro_actualites.xml",
        "pubkey": "8e229ea2bf1aadbabbe2d1874c85ab9ae949b30a8a225d722432dd5147b28c5d"
      }
    ]
  },
  {
    "id": "fr-liberation",
    "name": "Libération",
    "homepage": "https://www.liberation.fr",
    "feeds": [
      {
        "url": "https://www.liberation.fr/arc/outboundfeeds/rss/",
        "pubkey": "461ba946bede05880d1042c1df7d8bbca6a09daabb02f2538258a820161626cf"
      }
    ]
  },
  {
    "id": "fr-rfi",
    "name": "RFI Français",
    "homepage": "https://www.rfi.fr/fr/",
    "feeds": [
      {
        "url": "https://www.rfi.fr/fr/rss",
        "pubkey": "c59867460d924acf6b0b8dc5f410b6a911aa49e39d3250b9799dc7ab8a580ae2"
      }
    ]
  }
] as const satisfies readonly AtomstrSource[];
