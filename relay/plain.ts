/** Extract inert, bounded text from remote metadata without inserting it into the page. */
export function plain(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = new DOMParser().parseFromString(value, 'text/html').body.textContent!;
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
