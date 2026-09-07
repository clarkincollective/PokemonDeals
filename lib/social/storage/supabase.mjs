// Phase 13E.5C - SUPABASE STORAGE adapter for public social media.
//
// WHY SUPABASE STORAGE (see docs/social-distribution.md):
//   * already the project's database - @supabase/supabase-js is a
//     dependency, NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
//     already configured. No new account, no new paid infrastructure.
//   * a PUBLIC bucket serves a stable, unauthenticated HTTPS URL of the
//     form  <url>/storage/v1/object/public/<bucket>/<key>  with the right
//     Content-Type - exactly what Buffer needs (it fetches the URL, it
//     does not upload).
//   * programmatic upload + delete via the service-role key (server-side
//     only - this module is never imported by the browser).
//
// The bucket `social-public` was created once (public, 25 MB per-file
// limit, MIME allow-list image/png,image/jpeg,video/mp4).
//
// This module does content-addressed uploads only. It never overwrites an
// existing object (upsert:false) so a frozen social post can never suffer
// asset drift.

import { createClient } from "@supabase/supabase-js";

export const BUCKET = "social-public";
export const ALLOWED_MIME = Object.freeze(["image/png", "image/jpeg", "video/mp4"]);
export const MAX_BYTES = 25_000_000;

export function supabaseStorage(env = process.env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() || null;
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim() || null;
  const client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  const publicUrlFor = (storageKey) =>
    url ? `${url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${storageKey}` : null;

  return {
    name: "supabase",
    bucket: BUCKET,
    isConfigured: () => Boolean(client),
    publicUrlFor,

    // Upload bytes at a content-addressed key. Never overwrites: if the
    // key already exists this is a no-op that returns the existing URL
    // (that IS the dedupe path - identical bytes -> identical key).
    async upload({ storageKey, bytes, contentType }) {
      if (!client) return { ok: false, reason: "supabase_storage_not_configured" };
      if (!ALLOWED_MIME.includes(contentType)) return { ok: false, reason: `mime_not_allowed:${contentType}` };
      if (!(bytes?.length > 0)) return { ok: false, reason: "empty_bytes" };
      if (bytes.length > MAX_BYTES) return { ok: false, reason: `too_large:${bytes.length}>${MAX_BYTES}` };
      const { error } = await client.storage.from(BUCKET).upload(storageKey, bytes, {
        contentType,
        upsert: false,
        cacheControl: "31536000", // 1 year - the key is a content hash, the object is immutable
      });
      if (error) {
        const dup = /exists|duplicate|resource already/i.test(error.message || "");
        if (dup) return { ok: true, storageKey, publicUrl: publicUrlFor(storageKey), deduped: true };
        return { ok: false, reason: `supabase_upload_error`, detail: error.message };
      }
      return { ok: true, storageKey, publicUrl: publicUrlFor(storageKey), deduped: false };
    },

    // HEAD the public URL the way Buffer would. Returns
    // { ok, status, contentType, contentLength }.
    async head(publicUrl) {
      try {
        const r = await fetch(publicUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
        return {
          ok: r.ok,
          status: r.status,
          contentType: r.headers.get("content-type"),
          contentLength: Number(r.headers.get("content-length")) || null,
          authChallenged: r.status === 401 || r.status === 403 || Boolean(r.headers.get("www-authenticate")),
        };
      } catch (e) {
        return { ok: false, status: 0, error: String(e?.message ?? e).slice(0, 200) };
      }
    },

    // Fetch a small byte range to prove the object is really fetchable /
    // seekable (used for MP4). Returns { ok, status, bytes }.
    async probeRange(publicUrl, bytes = 2048) {
      try {
        const r = await fetch(publicUrl, { headers: { Range: `bytes=0-${bytes - 1}` }, signal: AbortSignal.timeout(15000) });
        const buf = r.ok || r.status === 206 ? Buffer.from(await r.arrayBuffer()) : null;
        return { ok: r.ok || r.status === 206, status: r.status, bytes: buf?.length ?? 0, acceptRanges: r.headers.get("accept-ranges") };
      } catch (e) {
        return { ok: false, status: 0, error: String(e?.message ?? e).slice(0, 200) };
      }
    },

    async listKeys(prefix = "") {
      if (!client) return { ok: false, reason: "supabase_storage_not_configured" };
      const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: 1000 });
      if (error) return { ok: false, reason: error.message };
      return { ok: true, keys: (data ?? []).map((o) => (prefix ? `${prefix}/` : "") + o.name) };
    },

    // Retention: delete keys. The CALLER must have already checked that no
    // QUEUED/PUBLISHED ledger row references them (hostedAssets.mjs).
    async remove(storageKeys = []) {
      if (!client) return { ok: false, reason: "supabase_storage_not_configured" };
      if (!storageKeys.length) return { ok: true, removed: [] };
      const { data, error } = await client.storage.from(BUCKET).remove(storageKeys);
      if (error) return { ok: false, reason: error.message };
      return { ok: true, removed: (data ?? []).map((o) => o.name) };
    },
  };
}
