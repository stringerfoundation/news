// Bound decoded response bytes before allocating the complete text or parsing JSON.
export const MAX_RESPONSE_BYTES = 5_000_000;
export async function readResponseText(response: Response, limit = MAX_RESPONSE_BYTES): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let received = 0;
  try {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) throw new Error('Source response too large');
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) throw new Error('Source response too large');
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the original response failure. */ }
    throw error;
  } finally { reader.releaseLock(); }
}
