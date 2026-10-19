import { load } from 'cheerio';
import { translator } from '../reader-locales.js';
import { PORTUGUESE_SOURCES } from '../portuguese-sources.js';

export function localizedReaderHtml(html, locale) {
  const $ = load(html);
  const t = translator(locale);
  if (!$('#source-picker').length) $('#world-news').before("        <details id=\"source-picker\" class=\"source-picker\">\n          <summary>Sources <span id=\"source-count\" aria-live=\"polite\">5 of 5 enabled</span></summary>\n          <fieldset><legend>Choose news sources</legend><input id=\"source-search\" type=\"search\" aria-label=\"Search sources\" placeholder=\"Search sources\" hidden /><div id=\"source-options\" class=\"source-options\"></div><p id=\"no-matching-sources\" hidden>No matching sources.</p></fieldset>\n          <button type=\"button\" id=\"enable-all-sources\">Enable all</button>\n          <p class=\"source-help\">Your choices are saved in this browser.</p>\n        </details>\n");
  $('html').attr('lang', locale);
  $('title').text('Notícias em português | The Stringer Foundation');
  $('meta[name="description"]').attr('content', 'Manchetes de fontes em língua portuguesa e reportagens selecionadas pela The Stringer Foundation.');
  // Translate static UI text, never reporting, identifiers, licenses or URLs.
  $('body *').contents().each((_, node) => {
    if (node.type !== 'text') return;
    const original = node.data.trim();
    if (original) node.data = node.data.replace(original, t(original));
  });
  $('*').each((_, node) => {
    for (const attr of ['aria-label', 'title']) {
      const value = $(node).attr(attr);
      if (value) $(node).attr(attr, t(value));
    }
  });
  for (const attr of ['src', 'href']) {
    $(`[${attr}]`).each((_, node) => {
      const value = $(node).attr(attr);
      if (value?.startsWith('./')) $(node).attr(attr, `.${value}`);
    });
  }
  $('.edition-switcher a').removeAttr('aria-current');
  $(`.edition-switcher a[hreflang="${locale}"]`).attr('aria-current', 'page');
  $('#source-count').text(t('{enabled} of {total} enabled', {enabled: PORTUGUESE_SOURCES.length, total: PORTUGUESE_SOURCES.length}));
  $('.column-heading').first().append($('<p class="source-provenance"></p>').append(
    $('<a href="https://atomstr.data.haus/" target="_blank" rel="noopener noreferrer"></a>').text(t('Atomstr mirrors; these are not official publisher Nostr accounts.')),
  ));
  return $.html();
}
