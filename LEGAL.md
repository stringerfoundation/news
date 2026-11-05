# Content publication policy

Updated: 16 October 2026.

## Global Newswire

The owner has directed the portal to display publisher headlines, publisher attribution, source-provided publication dates and times, and links to original articles. This scope includes BBC World, NYT World, Al Jazeera, DW, and CNA World. Enabling these headline-and-link feeds does not require a permission-review record or further owner confirmation in the project workflow.

Publisher summaries and images are disabled in `CONTENT_PERMISSIONS`. Collection does not enrich publisher images from article pages, and sanitization strips summaries and images from retained snapshots. The reader suppresses publisher photos and URL-only image fallbacks regardless of URL parameters, including `?images`. No publisher image files are saved or rehosted. Source-provided dates are displayed in each reader's browser time zone; missing dates are not invented.

This records the owner's publication policy, not a claim of publisher authorization or a legal determination. Attribution and original links remain mandatory. The project's software license does not grant redistribution rights to third-party content.

## Stringer reporting and photos

The right column mirrors Stringer's courageous-stories collection. The owner requested this collection and confirmed “Stringer photos are fine” on 11 September 2026. This covers photos matched to that collection, not arbitrary images from linked publishers. Retain journalist credits and original destinations.

On 20 September 2026, the owner selected `syria-3talawjYJe7gOOcj.png` for “Syria’s Poisoned Earth” by Mais Katt and Loujeina Haj Youssef, despite the source image anchor pointing to a different Daraj article. Keep this exact mapping.

## Source and reader behavior

- Use the publisher RSS endpoints configured in `news-model.ts`. CNA's official [RSS directory](https://www.channelnewsasia.com/rss) lists the World feed with category `6311`.
- Render remote content as text and restrict article destinations to HTTP(S).
- Browser source preferences control the newswire display only; they do not stop shared collection or change publication policy.
- Preserve truthful loading, empty, unavailable, and recovery states. Reader source preferences cannot enable publisher summaries or images.
- No social embeds are used. Do not substitute unofficial mirrors or arbitrary Nostr accounts for configured sources or journalists.

## Repository and deployment

Development instructions, legal notes, tests, raw RSS/HTML fixtures, and private backend data are excluded from the public Pages artifact. Private credentials, keys, CSV, and SQLite backups remain outside tracked source. Historical snapshots or relay notes may still contain publisher image metadata from earlier test configurations; current sanitization removes it before use. Historical publication is not erased by changing this policy.

Earlier image-test and preview decisions are superseded by the owner's 16 October 2026 instruction to use no publisher images. Stringer photos remain enabled. Existing rights-holder notices and the contact link remain available for rights or removal requests.

## Historical social-source discovery

Checked 11 September 2026. These are discovery notes, not a live feed audit or reuse authorization. “Not confirmed” means the review did not establish an official account; it does not prove that none exists. Profile names and claims of being “official” alone are insufficient evidence.

| Publisher | Bluesky | Mastodon | Nostr |
| --- | --- | --- | --- |
| BBC | BBC-branded profiles found, but a main publisher-owned news account was not verified. | [social.bbc](https://social.bbc/about) is the BBC's server; specialist accounts were found, not a verified complete World news feed. | [BBC News (NewsBot)](https://damus.io/npub1n3wsckgal6qqy5renf7pccm0sv2xj4n8wjnp9yds30fupe8q37uqv77ykq) and RSS-style mirrors were found; BBC ownership was not established. |
| The New York Times | [@nytimes.com](https://bsky.app/profile/nytimes.com), using the publisher's domain handle. | No official main news account confirmed. | No official account confirmed. |
| Al Jazeera | [@aljazeera.com](https://bsky.app/profile/aljazeera.com), using the publisher's domain handle. | No official main news account confirmed. | No official account confirmed. |
| DW | [@deutschewelle.dw.com](https://bsky.app/profile/deutschewelle.dw.com), corporate communications rather than a general English-language newswire. | [DW Innovation's announcement](https://innovation.dw.com/articles/dw-innovation-mastodon-fediverse) identifies `@dw_innovation@mastodon.social`; its scope is technology/R&D, not a general world-news feed. The announcement is historical and does not establish current posting activity. | No official account confirmed. |

NYT and Al Jazeera on Bluesky are candidates for further evaluation, not enabled sources. Before implementation, recheck publisher ownership through domain verification or a publisher-site link, inspect current activity and original-story links, and evaluate how much of the desired coverage is actually posted. Domain ownership does not establish rights to every attached photograph. Unofficial mirrors must be identified as such and cannot grant rights they do not hold.

## Language-specific editions

The `/br/`, `/pt/`, `/fr/`, `/es/`, `/ar/`, `/zh/`, `/ru/`, `/nl/`, and `/de/` readers use the configured Atomstr mirrors for publisher headlines, attribution, mirror timestamps, and original HTTP(S) links only. These are third-party mirror identities, not official publisher Nostr accounts. Social-feed fallbacks are labeled. Publisher summaries and images remain disabled, and Stringer reporting and approved photos remain separate. Translating interface labels does not translate reporting or grant additional content rights.
