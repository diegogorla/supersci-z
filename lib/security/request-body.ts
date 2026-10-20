export class RequestBodyError extends Error {
  constructor(public status: 400 | 413 | 415, message: string) { super(message); }
}

/** Count streamed bytes; Content-Length alone is controlled by the caller. */
export async function readBoundedText(request: Request, maxBytes = 16_384): Promise<string> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new RequestBodyError(413, "payload_too_large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RequestBodyError(413, "payload_too_large"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(400, "invalid_body");
  } finally { reader.releaseLock(); }
}

export async function readBoundedJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new RequestBodyError(415, "json_required");
  }
  try { return JSON.parse(await readBoundedText(request, maxBytes)); }
  catch (error) { if (error instanceof RequestBodyError) throw error; throw new RequestBodyError(400, "invalid_json"); }
}
