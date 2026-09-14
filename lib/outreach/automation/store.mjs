// OUTREACH-AUTO-1 - durable outreach state in a PRIVATE Supabase Storage
// bucket (correspondence is personal data; never the public social bucket).
//
//   state/records.json       outreach records (seeded once from lib/outreach/records.json)
//   state/suppression.json   suppression list (seeded from lib/outreach/suppression.json)
//   state/control.json       { paused, pausedReason, pausedAt } - the emergency pause
//   state/cursor.json        { since } - reply polling cursor
//   claims/<email-id>.json   WRITE-ONCE claim: an incoming email is handled at most once
//   threads/<thread-id>.json per-thread automated-reply counters (loop guard)
//   events/<iso>-<rand>.json append-only audit log

import { supabaseAdmin } from "../../supabaseAdmin.js";

export const BUCKET = "outreach-private";

export function outreachStore({ db = supabaseAdmin() } = {}) {
  const bucket = () => db.storage.from(BUCKET);
  let ensured = false;
  async function ensure() {
    if (ensured) return;
    const { data } = await db.storage.getBucket(BUCKET);
    if (!data) {
      const { error } = await db.storage.createBucket(BUCKET, { public: false });
      if (error && !/exists/i.test(error.message)) throw new Error(`outreach bucket: ${error.message}`);
    } else if (data.public) {
      throw new Error("outreach bucket is public - refusing to store correspondence");
    }
    ensured = true;
  }
  async function getJson(key, fallback = null) {
    await ensure();
    const { data, error } = await bucket().download(key);
    if (error) return fallback;
    try { return JSON.parse(await data.text()); } catch { return fallback; }
  }
  async function putJson(key, value, { upsert = true } = {}) {
    await ensure();
    const body = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const { error } = await bucket().upload(key, body, { upsert, contentType: "application/json" });
    if (error) return { ok: false, conflict: /exists|duplicate|409/i.test(error.message), error: error.message };
    return { ok: true };
  }
  return {
    getJson, putJson,
    // true only for the FIRST caller - atomic at the storage layer (upsert:false)
    claim: async (key, value) => (await putJson(key, value, { upsert: false })).ok,
    event: (kind, detail) => putJson(`events/${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}.json`, { kind, at: new Date().toISOString(), ...detail }, { upsert: false }),
  };
}
