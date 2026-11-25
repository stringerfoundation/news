import { readFile, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { SOURCES, articleLink, formatPublicationDate, uniqueStories } from '../news-model.ts';
import { EDITIONS, translator } from '../reader-locales.ts';
import type { Story } from '../relay/types.ts';
import { STRINGER_MEDIA } from '../stringer-media.ts';
import { parseStringer, type TextRequest } from './collect.ts';

const collection = SOURCES.find(source => source.id === 'stringer')!;

export async function embedStringerStories(site: string, request: TextRequest) {
  let stories: Story[];
  try {
    const html = await request(collection.url, { attempts: 1, allowedHosts: [new URL(collection.url).hostname] });
    stories = uniqueStories(parseStringer(html));
  } catch {
    console.warn('Courageous Stories unavailable for this build');
    return;
  }

  for (const { path, locale } of EDITIONS) {
    const file = path ? `${site}/${path}/index.html` : `${site}/index.html`;
    const $ = load(await readFile(file, 'utf8'));
    const list = $('#stringer-news').attr({ 'data-prerendered': '', 'aria-busy': 'false' }).empty();
    const t = translator(locale);
    for (const [index, story] of stories.entries()) {
      const media = STRINGER_MEDIA.get(story.url);
      const figure = $('<figure class="story-media"></figure>');
      if (media) {
        figure.append($('<img>').attr({
          src: path ? `.${media.image}` : media.image,
          alt: '', width: '240', height: '240', decoding: 'async',
          loading: index === 0 ? 'eager' : 'lazy',
        }));
      } else {
        figure.append($('<div class="story-placeholder" aria-hidden="true"></div>'));
      }
      const link = $('<a target="_blank" rel="noopener noreferrer"></a>')
        .attr('href', articleLink(story.url)).append($('<h3></h3>').text(story.title));
      const meta = $('<div class="meta"></div>').append($('<span class="source"></span>')
        .text(new URL(story.url).hostname.replace(/^www\./, '')));
      const date = media?.publishedAt?.slice(0, 10) ?? media?.publicationDate;
      if (date) {
        meta.append($('<span aria-hidden="true">·</span>'),
          $('<time></time>').attr('datetime', date).text(formatPublicationDate(date, locale)));
      } else {
        meta.append($('<span></span>').text(t('Publication date unavailable')));
      }
      const body = $('<div class="story-body"></div>').append(link,
        $('<p class="credits"></p>').text(story.credits!), $('<p class="summary"></p>').text(story.summary), meta);
      list.append($('<article class="story with-image" dir="auto"></article>').append(figure, body));
    }
    $('.collection-link').removeAttr('hidden');
    await writeFile(file, $.html());
  }
}
