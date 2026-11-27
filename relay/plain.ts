import { load } from 'cheerio';

/** Server/build parser for remote metadata. It returns text only and never executes HTML. */
export function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  return (load(value)('body').text() || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
