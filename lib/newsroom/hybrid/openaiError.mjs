// SOCIAL-LIVE-2: sanitised, classified OpenAI image API failures.
//
// A safety refusal and a malformed request both arrive as HTTP 400, and the
// old callers treated every 400 alike (including retrying on another model).
// classifyImageApiError() separates them so a refusal is recorded and never
// retried - nothing may be re-sent to get past moderation - while a genuinely
// invalid request keeps a readable reason. Output never carries keys, tokens
// or the prompt.

const SAFETY_RX = /safety system|safety_violation|moderation_blocked|content_policy|content policy|image_generation_user_error/i;

export function sanitiseApiText(s, max = 240) {
  return String(s ?? "")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// status: HTTP status; body: raw response text; requestId: x-request-id header
export function classifyImageApiError({ status, body = "", requestId = null } = {}) {
  let err = null;
  try { err = JSON.parse(body)?.error ?? null; } catch { /* non-JSON body */ }
  const code = err?.code ?? null;
  const type = err?.type ?? null;
  const message = sanitiseApiText(err?.message ?? body);
  let kind = "unknown";
  if (SAFETY_RX.test(`${code ?? ""} ${type ?? ""} ${message}`)) kind = "safety_refusal";
  else if (status === 400 || status === 404 || status === 422) kind = "invalid_request";
  else if (status === 401 || status === 403) kind = "auth";
  else if (status === 429) kind = /quota|billing/i.test(message) ? "quota" : "rate_limited";
  else if (status >= 500) kind = "server";
  return {
    kind,
    status: status ?? null,
    code,
    type,
    param: err?.param ?? null,
    message,
    request_id: requestId ? sanitiseApiText(requestId, 80) : null,
    // a refusal is final for this content; auth/quota/invalid need a change first
    retryable: kind === "rate_limited" || kind === "server",
  };
}
