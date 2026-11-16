import type { AtomstrSource } from './relay/types.ts';
import { localeForLanguage } from './reader-locales.ts';
import { PORTUGUESE_SOURCES } from './portuguese-sources.ts';
import fr from './sources/fr.ts';
import es from './sources/es.ts';
import ar from './sources/ar.ts';
import zh from './sources/zh.ts';
import ru from './sources/ru.ts';
import nl from './sources/nl.ts';
import de from './sources/de.ts';

export const EDITION_SOURCES: Readonly<Record<string, readonly AtomstrSource[]>> = {
  'pt-BR': PORTUGUESE_SOURCES, 'pt-PT': PORTUGUESE_SOURCES, fr, es, ar, zh, ru, nl, de,
};
export function sourcesForLocale(language: string): readonly AtomstrSource[] {
  return EDITION_SOURCES[localeForLanguage(language)] ?? [];
}
