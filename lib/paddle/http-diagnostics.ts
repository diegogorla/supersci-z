import "server-only";

// Only fixed documented codes are eligible for logging. No arbitrary provider
// text, detail, request ID, body, URL, customer identity, or headers are emitted.
const safeCodes = new Set([
  "authentication_malformed", "authentication_missing", "bad_gateway",
  "bad_request", "concurrent_modification", "conflict", "entity_archived",
  "forbidden", "internal_error", "invalid_client_token", "invalid_field",
  "invalid_json", "invalid_time_query_parameter", "invalid_token", "invalid_url",
  "method_not_allowed", "not_available_in_sandbox", "not_found", "not_implemented",
  "paddle_billing_not_enabled", "receipt_data_not_enabled", "request_body_too_large",
  "request_headers_too_large", "service_unavailable", "temporarily_unavailable",
  "too_many_requests", "unexpected_request_body", "unsupported_media_type",
]);

async function readErrorCode(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "unrecognized_paddle_error";
  let total = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 16_384) {
        await reader.cancel();
        return "unrecognized_paddle_error";
      }
      text += decoder.decode(value, { stream: true });
    }
    const parsed: unknown = JSON.parse(text + decoder.decode());
    const error = parsed && typeof parsed === "object" && "error" in parsed ? parsed.error : null;
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return typeof code === "string" && safeCodes.has(code) ? code : "unrecognized_paddle_error";
  } catch {
    return "unrecognized_paddle_error";
  } finally {
    reader.releaseLock();
  }
}

export async function logPaddleHttpFailure(response: Response): Promise<void> {
  const code = await readErrorCode(response);
  console.error("paddle_http_failure", { status: response.status, code });
}
