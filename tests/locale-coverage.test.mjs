import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';
import { EDITION_SOURCES, sourcesForLocale } from '../edition-sources.ts';
import { EDITIONS, localeForLanguage, translator } from '../reader-locales.ts';
import { localizedReaderHtml } from '../scripts/reader-html.ts';

const localizedLocales = ['fr', 'es', 'ar', 'zh', 'ru', 'nl', 'de'];

test('edition registry maps languages and region variants with the English fallback', () => {
  assert.deepEqual(EDITIONS.map(({path, locale, label, direction}) => ({path, locale, label, direction})), [
    {path: '', locale: 'en-US', label: 'EN', direction: 'ltr'},
    {path: 'br', locale: 'pt-BR', label: 'Português (Brasil)', direction: 'ltr'},
    {path: 'pt', locale: 'pt-PT', label: 'Português (Portugal)', direction: 'ltr'},
    {path: 'fr', locale: 'fr', label: 'Français', direction: 'ltr'},
    {path: 'es', locale: 'es', label: 'Español', direction: 'ltr'},
    {path: 'ar', locale: 'ar', label: 'العربية', direction: 'rtl'},
    {path: 'zh', locale: 'zh', label: '中文', direction: 'ltr'},
    {path: 'ru', locale: 'ru', label: 'Русский', direction: 'ltr'},
    {path: 'nl', locale: 'nl', label: 'Nederlands', direction: 'ltr'},
    {path: 'de', locale: 'de', label: 'Deutsch', direction: 'ltr'},
  ]);
  for (const [input, expected] of [
    ['en', 'en-US'], ['en-GB', 'en-US'], ['pt', 'pt-BR'], ['PT-br', 'pt-BR'], ['pt-PT', 'pt-PT'],
    ['PT-pt', 'pt-PT'], ['fr-CA', 'fr'], ['ES-mx', 'es'], ['ar-EG', 'ar'], ['zh-TW', 'zh'],
    ['ru-RU', 'ru'], ['nl-BE', 'nl'], ['de-AT', 'de'], ['', 'en-US'], ['xx-ZZ', 'en-US'],
  ]) assert.equal(localeForLanguage(input), expected, input);
});

test('every imported locale catalogue is selected for its language and region variant only', () => {
  assert.strictEqual(EDITION_SOURCES['pt-BR'], EDITION_SOURCES['pt-PT']);
  assert.ok(EDITION_SOURCES['pt-BR'].length > 0);
  for (const locale of localizedLocales) {
    const sources = EDITION_SOURCES[locale];
    assert.ok(sources.length > 0, `${locale} catalogue has sources`);
    assert.strictEqual(sourcesForLocale(locale), sources);
    assert.strictEqual(sourcesForLocale(`${locale}-XX`), sources);
  }
  assert.strictEqual(sourcesForLocale('pt-BR'), EDITION_SOURCES['pt-BR']);
  assert.strictEqual(sourcesForLocale('pt-PT'), EDITION_SOURCES['pt-BR']);
  assert.deepEqual(sourcesForLocale('en'), []);
  assert.deepEqual(sourcesForLocale('en-GB'), []);
  assert.deepEqual(sourcesForLocale('xx'), []);
  assert.deepEqual(sourcesForLocale('xx-ZZ'), []);
});

test('translator keeps placeholders, substitutes values, falls back to source text, and preserves PT variants', () => {
  for (const locale of ['pt-BR', 'pt-PT', ...localizedLocales]) {
    const t = translator(locale);
    assert.equal(t('{enabled} of {total} enabled', {enabled: 4, total: 7}).includes('{enabled}'), false, locale);
    assert.equal(t('{count} articles', {count: 2}).includes('{count}'), false, locale);
    assert.match(t('{source}: refresh unavailable.{retained}', {source: 'A', retained: ' B'}), /A.*B/, locale);
    assert.equal(t('This message has {missing} and {given}.', {given: 12}), 'This message has {missing} and 12.', locale);
    assert.equal(t('Unknown source string'), 'Unknown source string', locale);
    assert.notEqual(t('Close menu'), 'Close menu', locale);
  }
  assert.equal(translator('pt-BR')('Donate now'), 'Doe agora');
  assert.equal(translator('pt-PT')('Donate now'), 'Faça um donativo');
  assert.equal(translator('pt-BR')('Your choices are saved in this browser.'), 'Suas escolhas são salvas neste navegador.');
  assert.equal(translator('pt-PT')('Your choices are saved in this browser.'), 'As suas escolhas ficam guardadas neste navegador.');
  assert.equal(translator('en-GB')('Donate now'), 'Donate now');
  assert.equal(translator('xx-ZZ')('Donate now'), 'Donate now');
});

test('localized reader HTML translates interface text, preserves routes, selects the active edition, and sets RTL', () => {
  const original = readFileSync('index.html', 'utf8');
  const cases = [
    {input: 'fr-CA', locale: 'fr', direction: 'ltr'},
    {input: 'es-MX', locale: 'es', direction: 'ltr'},
    {input: 'ar-EG', locale: 'ar', direction: 'rtl'},
    {input: 'zh-TW', locale: 'zh', direction: 'ltr'},
    {input: 'ru-RU', locale: 'ru', direction: 'ltr'},
    {input: 'nl-BE', locale: 'nl', direction: 'ltr'},
    {input: 'de-AT', locale: 'de', direction: 'ltr'},
    {input: 'pt-BR', locale: 'pt-BR', direction: 'ltr'},
    {input: 'pt-PT', locale: 'pt-PT', direction: 'ltr'},
  ];
  for (const {input, locale, direction} of cases) {
    const $ = load(localizedReaderHtml(original, input));
    const t = translator(locale);
    assert.equal($('html').attr('lang'), locale, `${input} lang`);
    assert.equal($('html').attr('dir'), direction, `${input} direction`);
    assert.equal($('title').text(), `${t('Stringer World News')} | The Stringer Foundation`, `${input} title`);
    assert.equal($('meta[name="description"]').attr('content'), locale.startsWith('pt-')
      ? 'Manchetes de fontes em língua portuguesa e reportagens selecionadas pela The Stringer Foundation.'
      : t('Headlines from publishers in this language.'), `${input} description`);
    assert.equal($('script[type="module"]').attr('src'), '../app.js', `${input} module path`);
    assert.ok($('link[href*="style.css"]').attr('href')?.startsWith('../style.css'), `${input} stylesheet path`);
    const hreflang = locale === 'en-US' ? 'en' : locale;
    assert.equal($(`.edition-switcher a[hreflang="${hreflang}"]`).attr('aria-current'), 'page', `${input} active link`);
    assert.equal($(`.edition-switcher a[hreflang="en"]`).attr('href'), '../', `${input} English route`);
    assert.equal($(`.edition-switcher a[hreflang="fr"]`).attr('href'), '../fr/', `${input} French route`);
    assert.equal($(`.edition-switcher a[hreflang="es"]`).attr('href'), '../es/', `${input} Spanish route`);
    assert.equal($('nav.main-nav').attr('aria-label'), t('Main navigation'), `${input} translated aria label`);
    assert.equal($('.skip-link').text(), t('Skip to news'), `${input} translated body text`);
    assert.equal(Boolean($('#source-picker').length), true, `${input} source picker`);
    assert.ok($('#source-count').text().includes(String(EDITION_SOURCES[locale].length)), `${input} source count`);
    assert.ok($('.source-provenance').text().includes(t('Atomstr mirrors; these are not official publisher Nostr accounts.')),
      `${input} provenance`);
  }
});

test('English static HTML uses shared root assets and does not add an empty source picker', () => {
  const original = readFileSync('index.html', 'utf8');
  const $ = load(localizedReaderHtml(original, 'en-GB'));
  assert.equal($('html').attr('lang'), 'en');
  assert.equal($('html').attr('dir'), 'ltr');
  assert.equal($('script[type="module"]').attr('src'), './app.js');
  assert.equal($('#source-picker').length, 0);
  assert.equal($('.source-provenance').length, 0);
  assert.equal($('.edition-switcher a[hreflang="en"]').attr('aria-current'), 'page');
  assert.equal($('.edition-switcher a[hreflang="fr"]').attr('href'), './fr/');
});

test('localizedReaderHtml reuses an existing picker instead of inserting a duplicate', () => {
  const source = readFileSync('index.html', 'utf8').replace(
    '<section class="column" id="global-newswire"',
    '<details id="source-picker"></details><section class="column" id="global-newswire"',
  );
  const $ = load(localizedReaderHtml(source, 'fr'));
  assert.equal($('#source-picker').length, 1);
});
