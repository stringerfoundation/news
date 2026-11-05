const MAX_RESPONSE_BYTES = 5e6;
async function readResponseText(response, limit = MAX_RESPONSE_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  const chunks = [];
  let received = 0;
  try {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) throw new Error("Source response too large");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) throw new Error("Source response too large");
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export {
  MAX_RESPONSE_BYTES,
  readResponseText
};
