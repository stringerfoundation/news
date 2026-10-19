import fr from './locales/fr.ts';
import es from './locales/es.ts';
import ar from './locales/ar.ts';
import zh from './locales/zh.ts';
import ru from './locales/ru.ts';
import nl from './locales/nl.ts';
import de from './locales/de.ts';
// Interface translations only. Reporting is always displayed in its original language.
const portuguese: Readonly<Record<string, string>> = {
  'Close menu': 'Fechar menu', 'Open menu': 'Abrir menu', 'Sources': 'Fontes',
  'Choose news sources': 'Escolha as fontes de notícias', 'Enable all': 'Ativar todas',
  'Your choices are saved in this browser.': 'Suas escolhas são salvas neste navegador.',
  '{enabled} of {total} enabled': '{enabled} de {total} ativas',
  'Search sources': 'Buscar fontes', 'No sources selected.': 'Nenhuma fonte selecionada.',
  'No matching sources.': 'Nenhuma fonte corresponde à busca.',
  'May require subscription': 'Pode exigir assinatura', '{count} articles': '{count} notícias',
  'View {count} articles': 'Ver {count} notícias', 'Show fewer headlines': 'Mostrar menos manchetes',
  'More headlines ({count})': 'Mais manchetes ({count})',
  'Global headlines are currently unavailable.': 'As manchetes estão indisponíveis no momento.',
  'No headlines available in this collection.': 'Nenhuma manchete disponível nesta coleção.',
  'Loading headlines…': 'Carregando manchetes…', 'Loading news…': 'Carregando notícias…',
  'Loading courageous stories…': 'Carregando reportagens corajosas…',
  'Loading the latest published collection…': 'Carregando a coleção mais recente…',
  'Headlines unavailable.': 'Manchetes indisponíveis.',
  'Courageous stories unavailable. You can still visit the Stringer collection below.': 'As reportagens estão indisponíveis. Você pode visitar a coleção da Stringer abaixo.',
  'Courageous stories are currently unavailable. Visit the Stringer collection below.': 'As reportagens estão indisponíveis no momento. Visite a coleção da Stringer abaixo.',
  'Could not check for updates. Keeping the previously loaded collection.': 'Não foi possível verificar as atualizações. A coleção anterior continua disponível.',
  'The news collection is unavailable. We’ll retry automatically.': 'As notícias estão indisponíveis. Tentaremos novamente automaticamente.',
  'Local time ({zone})': 'Horário local ({zone})',
  'Publication date; source does not provide a confirmed time zone and time': 'Data de publicação; a fonte não informa horário e fuso confirmados',
  'Publication date unavailable': 'Data de publicação indisponível', 'Date unavailable': 'Data indisponível',
  '{source}: refresh unavailable.{retained}': '{source}: atualização indisponível.{retained}',
  ' Showing previously collected stories.': ' Exibindo notícias obtidas anteriormente.',
  ' No stories available.': ' Nenhuma notícia disponível.',
  '{count} unavailable': '{count} indisponíveis', '{count} queued': '{count} na fila',
  'Read {title} at the original source': 'Leia {title} na fonte original',
  'Atomstr mirror timestamp ({zone})': 'Data informada pelo espelho Atomstr ({zone})',
  'via {network} / Atomstr': 'via {network} / Atomstr',
  'Atomstr mirrors; these are not official publisher Nostr accounts.': 'Espelhos do Atomstr; não são contas oficiais das fontes no Nostr.',
  'Feed status': 'Estado das fontes', 'Unavailable sources ({count})': 'Fontes indisponíveis ({count})',
  'Language': 'Idioma', 'Skip to news': 'Ir para as notícias',
  'The Stringer Foundation home': 'Página inicial da The Stringer Foundation',
  'Main navigation': 'Navegação principal', 'Donate': 'Doar', 'Donate now': 'Doe agora',
  'Home': 'Início', 'Mission': 'Missão', 'Who we are': 'Quem somos', 'Awards': 'Prêmios',
  'Contact us': 'Fale conosco', 'World news': 'Notícias do mundo',
  'Stringer social media': 'Redes sociais da Stringer', 'Stringer on Nostr via Primal': 'Stringer no Nostr via Primal',
  'Stringer on Instagram': 'Stringer no Instagram', 'Stringer on Facebook': 'Stringer no Facebook',
  'Stringer on LinkedIn': 'Stringer no LinkedIn', 'Stringer on YouTube': 'Stringer no YouTube',
  'Stringer World News': 'Stringer — Notícias em português', 'Around the world': 'Em língua portuguesa',
  'Global Newswire': 'Notícias em português', 'Courageous Stories': 'Reportagens corajosas',
  'Headlines from global publishers.': 'Manchetes de fontes em língua portuguesa.',
  'Beyond the headlines': 'Além das manchetes', "Stringer's Courageous Stories": 'Reportagens corajosas da Stringer',
  'Reporting selected by The Stringer Foundation.': 'Reportagens selecionadas pela The Stringer Foundation.',
  'Explore the Stringer collection': 'Explore a coleção da Stringer',
  'Enable JavaScript to load the news collection, or': 'Ative o JavaScript para carregar as notícias ou',
  'read Courageous Stories on Stringer’s website': 'leia as reportagens corajosas no site da Stringer',
  'The Stringer Foundation (EIN: 33-4278131) is a 501(c)(3) non-profit organization.': 'A The Stringer Foundation (EIN: 33-4278131) é uma organização sem fins lucrativos 501(c)(3).',
  'Support courageous journalism': 'Apoie o jornalismo corajoso',
  'Contribute to scaling up courageous journalism and nurturing the next generation of brave reporters.': 'Contribua para ampliar o jornalismo corajoso e apoiar a próxima geração de repórteres.',
  'Footer navigation': 'Navegação do rodapé', 'Explore Stringer': 'Conheça a Stringer',
  'Our mission': 'Nossa missão', 'Stringer Awards': 'Prêmios Stringer', 'Courageous stories': 'Reportagens corajosas',
  'Stories belong to their original publishers. Follow each headline to read or watch the original reporting.': 'As reportagens pertencem às fontes originais. Siga cada manchete para ler ou assistir à reportagem original.',
  'Preview images, including social media cards, belong to their rights holders. No endorsement or reuse rights implied. Rights or removal:': 'As imagens de prévia, incluindo cartões de redes sociais, pertencem aos respectivos titulares. A exibição não implica endosso nem direitos de reutilização. Direitos ou remoção:',
};
const portugal: Readonly<Record<string, string>> = {
  'Your choices are saved in this browser.': 'As suas escolhas ficam guardadas neste navegador.',
  'Search sources': 'Pesquisar fontes', 'No matching sources.': 'Nenhuma fonte corresponde à pesquisa.',
  'May require subscription': 'Pode exigir subscrição', 'Donate now': 'Faça um donativo', 'Donate': 'Fazer um donativo',
  'Contact us': 'Contactos', 'Awards': 'Prémios', 'Stringer Awards': 'Prémios Stringer',
  'Loading headlines…': 'A carregar manchetes…', 'Loading news…': 'A carregar notícias…',
  'Loading courageous stories…': 'A carregar reportagens corajosas…',
  'Loading the latest published collection…': 'A carregar a coleção mais recente…',
  'Courageous stories unavailable. You can still visit the Stringer collection below.': 'As reportagens estão indisponíveis. Pode visitar a coleção da Stringer abaixo.',
  'The news collection is unavailable. We’ll retry automatically.': 'As notícias estão indisponíveis. Voltaremos a tentar automaticamente.',
  'Local time ({zone})': 'Hora local ({zone})', ' Showing previously collected stories.': ' A mostrar notícias obtidas anteriormente.',
  'Our mission': 'A nossa missão', 'Explore the Stringer collection': 'Explore a coleção da Stringer',
};
export const EDITIONS = [
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
] as const;
export type Locale = typeof EDITIONS[number]['locale'];
const dictionaries: Readonly<Record<string, Readonly<Record<string, string>>>> = {fr, es, ar, zh, ru, nl, de};
export function localeForLanguage(language: string): Locale {
  const normalized = language.toLowerCase();
  if (normalized === 'pt-pt') return 'pt-PT';
  const base = normalized.split('-')[0];
  if (base === 'pt') return 'pt-BR';
  return EDITIONS.find(edition => edition.locale === base)?.locale ?? 'en-US';
}
export function translator(language: string) {
  const locale = localeForLanguage(language);
  return (message: string, values: Record<string, string | number> = {}) => {
    const translated = locale === 'pt-PT' ? portugal[message] ?? portuguese[message] ?? message
      : locale === 'pt-BR' ? portuguese[message] ?? message : dictionaries[locale]?.[message] ?? message;
    return translated.replace(/\{([a-zA-Z]+)\}/g, (whole, key) => values[key] === undefined ? whole : String(values[key]));
  };
}
