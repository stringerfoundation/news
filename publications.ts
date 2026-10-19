// Exact original URLs only. Reviewed dates carry evidence; retained timestamps
// come from the production snapshot of 2026-09-24T21:46:27.470Z.
export interface Publication { publishedAt: string | null; publicationDate: string | null; }
export type ReviewedPublication = { evidence: string } & (
  | { publishedAt: string; publicationDate?: never }
  | { publicationDate: string; publishedAt?: never }
);
interface PublicationRecord { reviewed?: ReviewedPublication; retained?: Publication; }
const publications: ReadonlyMap<string, PublicationRecord> = new Map([
  [
    "https://www.instagram.com/reel/DMsRo8JNRY8/?igsh=MWc5aXJiZml4c2l4cA==",
    {
      "reviewed": {
        "publicationDate": "2025-07-29",
        "evidence": "Publication date supplied by the site owner for this exact Instagram reel on 25 September 2026."
      }
    }
  ],
  [
    "https://theblacksea.eu/special-reports/turkeys-escobar-key-to-new-cocaine-drop-offs/",
    {
      "reviewed": {
        "publicationDate": "2025-07-24",
        "evidence": "Publisher byline displays 24 July 2025."
      }
    }
  ],
  [
    "https://interactive.thenewhumanitarian.org/stories/2026/03/24/india-assam-evictions-forced-displacement",
    {
      "reviewed": {
        "publicationDate": "2026-03-24",
        "evidence": "Publisher heading below the authors displays 24 March 2026."
      }
    }
  ],
  [
    "https://www.planetadelibros.com.co/libro-el-archivo-secreto/384207",
    {
      "reviewed": {
        "publicationDate": "2023-11-27",
        "evidence": "Publisher Ficha Técnica: Publicación 27 noviembre 2023; ISBN 978-628-7665-46-0."
      }
    }
  ],
  [
    "https://beta.elfaro.net/las-confesiones-de-charli-entrevista-con-un-lider-pandillero-que-pacto-con-el-gobierno-de-bukele",
    {
      "reviewed": {
        "publicationDate": "2025-05-01",
        "evidence": "Publisher article header displays Jueves, 1 de mayo de 2025."
      }
    }
  ],
  [
    "https://www.youtube.com/watch?v=fyGdDKA097E",
    {
      "reviewed": {
        "publishedAt": "2025-07-22T12:01:21.000Z",
        "evidence": "Original video meta itemprop=datePublished: 2025-07-22T05:01:21-07:00."
      }
    }
  ],
  [
    "https://www.youtube.com/watch?v=T86VX7Ov_A4",
    {
      "reviewed": {
        "publishedAt": "2026-02-19T18:22:38.000Z",
        "evidence": "Original video meta itemprop=datePublished: 2026-02-19T10:22:38-08:00."
      }
    }
  ],
  [
    "https://youtu.be/QgeFYSxrVwY?si=rzsnmF-Nb6cMnpXa",
    {
      "reviewed": {
        "publishedAt": "2022-03-18T17:49:59.000Z",
        "evidence": "Original video meta itemprop=datePublished: 2022-03-18T10:49:59-07:00."
      }
    }
  ],
  [
    "https://www.thenewhumanitarian.org/first-person/2025/11/05/exile-i-watched-el-fasher-fall-and-my-family-fight-survive",
    {
      "reviewed": {
        "publicationDate": "2025-11-05",
        "evidence": "Publisher article header displays 5 November 2025."
      }
    }
  ],
  [
    "https://www.thenewhumanitarian.org/opinion/2015/11/17/what-talks-burundi-should-look",
    {
      "reviewed": {
        "publicationDate": "2015-11-17",
        "evidence": "Publisher article header displays 17 November 2015."
      }
    }
  ],
  [
    "https://www.bitacoraec.com/post/tr%C3%A1fico-de-iguanas-de-gal%C3%A1pagos-un-a%C3%B1o-de-silencio-del-ministerio-del-ambiente",
    {
      "reviewed": {
        "publicationDate": "2023-04-25",
        "evidence": "Publisher article header displays 25 April 2023."
      },
      "retained": {
        "publishedAt": "2023-04-25T14:46:22.188Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://www.premiumtimesng.com/regional/nwest/773640-investigation-behind-closed-doors-the-dark-reality-of-child-labour-in-a-northern-states-quranic-schools.html",
    {
      "reviewed": {
        "publicationDate": "2025-02-12",
        "evidence": "Publisher article page displays 12 February 2025."
      },
      "retained": {
        "publishedAt": "2025-02-12T05:00:31.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://www.aljazeera.com/video/people-power/2025/7/31/death-in-the-park",
    {
      "reviewed": {
        "publicationDate": "2025-07-31",
        "evidence": "Publisher video page displays 31 Jul 2025."
      },
      "retained": {
        "publishedAt": "2025-07-31T16:00:00.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://elestimulo.com/de-interes/2025-03-17/venezolano-en-carcel-de-el-salvador-francisco/",
    {
      "reviewed": {
        "publicationDate": "2025-03-17",
        "evidence": "Publisher article header displays 17 March 2025; later update is dated 19 March."
      },
      "retained": {
        "publishedAt": "2025-03-17T13:56:02.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://unbiasthenews.org/syria-war-poisoned-soil/",
    {
      "reviewed": {
        "publicationDate": "2022-03-23",
        "evidence": "Publisher article page displays 23 March 2022."
      },
      "retained": {
        "publishedAt": "2022-03-23T13:33:39.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://snoop.ro/pe-urmele-banilor-din-reclamele-rusesti-drumul-de-la-ministerul-apararii-din-rusia-la-date-personale-colectate-din-romania/",
    {
      "reviewed": {
        "publicationDate": "2025-03-04",
        "evidence": "Publisher article page displays “publicat în 04.03.2025”."
      },
      "retained": {
        "publishedAt": "2025-03-04T04:06:09.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://verstka.media/how-russians-earn-money-by-sending-each-other-to-war",
    {
      "reviewed": {
        "publicationDate": "2025-12-17",
        "evidence": "Publisher article header displays 17 December 2025."
      },
      "retained": {
        "publishedAt": "2025-12-17T11:29:17.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://www.theguardian.com/news/2024/mar/28/how-child-labour-in-india-makes-the-paving-stones-beneath-our-feet",
    {
      "reviewed": {
        "publicationDate": "2024-03-28",
        "evidence": "Publisher article byline displays Thu 28 Mar 2024; 9 May is marked as last modified."
      },
      "retained": {
        "publishedAt": "2024-03-28T05:00:26.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://www.telegraph.co.uk/global-health/terror-and-security/injured-ukrainian-soldiers-taking-up-tattooing-as-therapy/",
    {
      "retained": {
        "publishedAt": "2026-01-07T06:00:00.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://www.facebook.com/anasglobal/videos/watch-galamsey-economy-video/858993851792503/",
    {
      "retained": {
        "publishedAt": null,
        "publicationDate": "2022-11-16"
      }
    }
  ],
  [
    "https://www.rollingstone.com/culture/culture-features/haiti-gang-violence-crisis-g9-g-pep-1234871794",
    {
      "retained": {
        "publishedAt": "2023-11-26T14:01:54.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://panel.animalpolitico.com/corrupcion-detras-desabasto-medicamentos/",
    {
      "retained": {
        "publishedAt": null,
        "publicationDate": "2025-07-26"
      }
    }
  ],
  [
    "https://www.thebureauinvestigates.com/stories/2025-11-13/inside-ethiopias-illegal-gold-trade",
    {
      "retained": {
        "publishedAt": "2025-11-13T10:00:00.000Z",
        "publicationDate": null
      }
    }
  ],
  [
    "https://kilalopress.net/en/environment/drc-450-deaths-in-60-days-in-bomate-water-kills-silence-protects-justice-remains-silent/",
    {
      "retained": {
        "publishedAt": "2025-08-14T18:52:56.000Z",
        "publicationDate": null
      }
    }
  ]
]);
export const VERIFIED_PUBLICATIONS: ReadonlyMap<string, ReviewedPublication> = new Map(
  [...publications].flatMap(([url, value]) => value.reviewed ? [[url, value.reviewed] as const] : []));
export function publicationFallback(url: string, previous?: Partial<Publication>): Publication {
  const record = publications.get(url);
  const verified = record?.reviewed;
  const retained = previous?.publishedAt || previous?.publicationDate ? previous : record?.retained;
  // Keep a confirmed instant when a review establishes the same calendar date.
  const retainInstant = verified?.publicationDate && retained?.publishedAt &&
    retained.publishedAt.slice(0, 10) === verified.publicationDate;
  const chosen = retainInstant ? retained : verified || retained;
  return { publishedAt: chosen?.publishedAt || null, publicationDate: chosen?.publicationDate || null };
}
