import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EDITIONS, translator } from '../reader-locales.ts';
import { EDITION_SOURCES } from '../edition-sources.ts';
import { SOURCES, CONTENT_PERMISSIONS } from '../news-model.ts';
import relay from '../relay-config.ts';
import { ATOMSTR_RELAY } from '../atomstr-config.ts';
import fr from '../locales/fr.ts';
import es from '../locales/es.ts';
import ar from '../locales/ar.ts';
import zh from '../locales/zh.ts';
import ru from '../locales/ru.ts';
import nl from '../locales/nl.ts';
import de from '../locales/de.ts';

export const CATALOGUE_PATH = 'android/app/src/main/assets/catalogue.json';

// Native actions absent from the website. Existing interface copy continues to
// use its maintained dictionary; this small supplement belongs to Android.
const nativeActions: Record<string, Record<string, string>> = {
  'en-US': { Refresh: 'Refresh', 'Try again': 'Try again', 'Read at source': 'Read at source' },
  'pt-BR': { Refresh: 'Atualizar', 'Try again': 'Tentar novamente', 'Read at source': 'Ler na fonte' },
  'pt-PT': { Refresh: 'Atualizar', 'Try again': 'Tentar novamente', 'Read at source': 'Ler na fonte' },
  fr: { Refresh: 'Actualiser', 'Try again': 'Réessayer', 'Read at source': 'Lire à la source' },
  es: { Refresh: 'Actualizar', 'Try again': 'Reintentar', 'Read at source': 'Leer en la fuente' },
  ar: { Refresh: 'تحديث', 'Try again': 'حاول مجددًا', 'Read at source': 'اقرأ في المصدر' },
  zh: { Refresh: '刷新', 'Try again': '重试', 'Read at source': '阅读原文' },
  ru: { Refresh: 'Обновить', 'Try again': 'Попробовать снова', 'Read at source': 'Читать в источнике' },
  nl: { Refresh: 'Vernieuwen', 'Try again': 'Opnieuw proberen', 'Read at source': 'Lezen bij de bron' },
  de: { Refresh: 'Aktualisieren', 'Try again': 'Erneut versuchen', 'Read at source': 'Beim Herausgeber lesen' },
};

// Carry the maintained dictionaries, using the web translator's Portuguese
// overrides and fallback rules. These are interface strings, never story text.
const messages = [...new Set([fr, es, ar, zh, ru, nl, de].flatMap(Object.keys))].sort();

export function androidCatalogue() {
  return {
    schemaVersion: 1,
    relay: { pubkey: relay.pubkey, relays: relay.relays },
    atomstr: { relays: [ATOMSTR_RELAY] },
    englishSources: SOURCES,
    contentPermissions: CONTENT_PERMISSIONS,
    editions: EDITIONS.map(edition => ({
      id: edition.locale,
      label: edition.label,
      preferenceKey: edition.locale.startsWith('pt-') ? 'pt' : edition.locale,
      direction: edition.direction,
      strings: { ...Object.fromEntries(messages.map(message => [message, translator(edition.locale)(message)])), ...nativeActions[edition.locale] },
      sources: edition.locale === 'en-US' ? SOURCES : EDITION_SOURCES[edition.locale],
    })),
  };
}

export function catalogueJson() {
  return `${JSON.stringify(androidCatalogue(), null, 2)}\n`;
}

export async function generateCatalogue(path = CATALOGUE_PATH, check = false) {
  const expected = catalogueJson();
  if (check) {
    if (await readFile(path, 'utf8') !== expected) throw new Error('Android catalogue is out of date; run scripts/generate-android-catalogue.ts');
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateCatalogue(CATALOGUE_PATH, process.argv.includes('--check'));
}
