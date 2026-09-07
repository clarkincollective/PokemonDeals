// Phase SOCIAL-NEWSROOM-2 - STRUCTURED BACKLOG EVENT LOG (§41).
//
// Deterministic event records for the backlog pipeline. No secrets, no
// PII, no provider tokens - only ids, states, timestamps, and short
// reasons. The CLI appends these to
// .social-preview/editorial-newsroom/events.log (gitignored) and echoes
// them; a future cron can ship them wherever.
//
// Pure builders + a tiny appender.

import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";

export const EVENT_TYPES = Object.freeze([
  "STORY_CREATED",
  "STORY_UPDATED",
  "PLACEMENT_PLANNED",
  "QA_PASS",
  "QA_WATCH",
  "QA_FAIL",
  "ASSET_HOSTED",
  "BUFFER_QUEUE_REQUEST",
  "BUFFER_QUEUED",
  "BUFFER_RECONCILED",
  "BUFFER_DRIFT",
  "STORY_EXPIRED",
  "QUEUED_CONTENT_STALE",
  "BACKLOG_SUSPENDED",
  "FEED_REVIEW",
]);

const SECRET_RE = /(sk-[A-Za-z0-9]{8,}|Bearer\s+\S+|BUFFER_ACCESS_TOKEN|SERVICE_ROLE|api[_-]?key)/i;

export function makeEvent(type, fields = {}) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event type: ${type}`);
  const safe = {};
  for (const [k, v] of Object.entries(fields)) {
    const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
    if (SECRET_RE.test(String(s))) continue; // never log a secret-looking value
    safe[k] = v;
  }
  return { ts: new Date().toISOString(), event: type, ...safe };
}

const LOG_PATH = path.join(process.cwd(), ".social-preview", "editorial-newsroom", "events.log");

export function appendEvent(ev) {
  try {
    mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, JSON.stringify(ev) + "\n", "utf8");
  } catch {
    /* logging must never break the run */
  }
  return ev;
}

export function logEvent(type, fields = {}) {
  return appendEvent(makeEvent(type, fields));
}

export { LOG_PATH as EVENTS_LOG_PATH };
