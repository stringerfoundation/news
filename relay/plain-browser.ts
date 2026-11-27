/** Browser equivalent of plain.ts; parse inertly and only return text. */
export function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = new DOMParser().parseFromString(value, 'text/html').body.textContent!;
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
