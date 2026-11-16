import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from 'cheerio';
import arabic from '../locales/ar.ts';
import german from '../locales/de.ts';
import spanish from '../locales/es.ts';
import french from '../locales/fr.ts';
import dutch from '../locales/nl.ts';
import russian from '../locales/ru.ts';
import chinese from '../locales/zh.ts';
import { EDITIONS, localeForLanguage } from '../reader-locales.ts';
import { localizedReaderHtml } from '../scripts/reader-html.ts';

const newEditions: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ar: arabic, de: german, es: spanish, fr: french, nl: dutch, ru: russian, zh: chinese,
};

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z]+)\}/g)].map(match => match[1]!).sort();
}

test('all new edition dictionaries have the French key set and preserve every placeholder', () => {
  const referenceKeys = Object.keys(french).sort();
  assert.ok(referenceKeys.length > 0);
  for (const key of referenceKeys)
    assert.deepEqual(placeholders(french[key]!), placeholders(key), `French placeholders for source key ${key}`);
  for (const [locale, dictionary] of Object.entries(newEditions)) {
    assert.deepEqual(Object.keys(dictionary).sort(), referenceKeys, `${locale} key parity`);
    for (const key of referenceKeys) {
      assert.ok(dictionary[key]?.trim(), `${locale} has a translation for ${key}`);
      assert.deepEqual(placeholders(dictionary[key]!), placeholders(key), `${locale} placeholders for source key ${key}`);
    }
  }
});

test('edition registry and language mapping cover every locale and common region variants', () => {
  const expected = [
    ['', 'en-US', 'ltr'], ['br', 'pt-BR', 'ltr'], ['pt', 'pt-PT', 'ltr'],
    ['fr', 'fr', 'ltr'], ['es', 'es', 'ltr'], ['ar', 'ar', 'rtl'],
    ['zh', 'zh', 'ltr'], ['ru', 'ru', 'ltr'], ['nl', 'nl', 'ltr'], ['de', 'de', 'ltr'],
  ];
  assert.deepEqual(EDITIONS.map(edition => [edition.path, edition.locale, edition.direction]), expected);
  assert.ok(EDITIONS.every(edition => edition.label.trim().length > 0));

  for (const [input, locale] of [
    ['en-GB', 'en-US'], ['pt', 'pt-BR'], ['pt-BR', 'pt-BR'], ['pt-PT', 'pt-PT'],
    ['fr-FR', 'fr'], ['fr-CA', 'fr'], ['es-MX', 'es'], ['ar-EG', 'ar'],
    ['zh-TW', 'zh'], ['ru-RU', 'ru'], ['nl-BE', 'nl'], ['de-AT', 'de'], ['xx-ZZ', 'en-US'],
  ]) assert.equal(localeForLanguage(input!), locale, input!);
});

test('edition HTML has language metadata, relative shared assets, edition links, and a picker for each localized edition', () => {
  const source = readFileSync('index.html', 'utf8');
  for (const edition of EDITIONS) {
    const html = edition.path ? localizedReaderHtml(source, edition.locale) : source;
    const $ = load(html);
    const hreflang = edition.locale === 'en-US' ? 'en' : edition.locale;
    assert.equal($('html').attr('lang'), hreflang, `${edition.locale} lang`);
    assert.equal($('html').attr('dir'), edition.direction, `${edition.locale} direction`);
    assert.equal($('script[type="module"]').attr('src'), edition.path ? '../app.js' : './app.js');
    assert.equal($('link[href*="style.css"]').attr('href')?.startsWith(edition.path ? '../style.css' : './style.css'), true);

    const nav = $('.edition-switcher');
    assert.ok(nav.length, `${edition.locale} edition switcher`);
    const current = nav.find(`a[hreflang="${hreflang}"]`);
    assert.equal(current.attr('aria-current'), 'page', `${edition.locale} current edition`);
    assert.ok(`${current.text()} ${current.attr('aria-label') ?? ''}`.includes(edition.label), `${edition.locale} label`);
    for (const target of EDITIONS) {
      const targetHreflang = target.locale === 'en-US' ? 'en' : target.locale;
      const link = nav.find(`a[hreflang="${targetHreflang}"]`);
      const expectedHref = edition.path
        ? target.path ? `../${target.path}/` : '../'
        : target.path ? `./${target.path}/` : './';
      assert.equal(link.attr('href'), expectedHref, `${edition.locale} link to ${target.locale}`);
    }
    assert.equal(Boolean($('#source-picker').length), edition.locale !== 'en-US');
  }
});
