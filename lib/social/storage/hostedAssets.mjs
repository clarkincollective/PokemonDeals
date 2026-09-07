// Phase 13E.5C - THE HOSTED ASSET RECORD + STORE.
//
// One row per distinct piece of rendered media that has been (or could
// be) uploaded to public storage for Buffer to fetch. Content-addressed:
// the storage key IS the sha256 of the bytes, so identical bytes always
// resolve to one object and one row (dedupe), and a changed artifact
// always produces a NEW immutable object - a frozen social post can never
// suffer asset drift.
//
// Mirrors the outreach records.json / distribution ledger.json pattern:
// pure logic here, a JSON file next to it, the CLI on top. No network.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, basename } from "node:path";
import { ALLOWED_MIME, MAX_BYTES } from "./supabase.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const HOSTED_ASSETS_PATH = join(HERE, "hosted-assets.json");

export const EXT_MIME = Object.freeze({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".mp4": "video/mp4" });

// Paths that must NEVER be uploaded, whatever a caller passes.
const FORBIDDEN_PATH = /(^|[/\\])\.env|\.env(\.|$)|secret|credential|token|\.key$|manifest\.json$|\.log$|records\.json$|ledger\.json$|hosted-assets\.json$|supabase\/|\.social-preview[/\\](?:daily|13e4)[/\\].*(?:payload|manifest)\.json$/i;
// eBay seller imagery markers (belt-and-braces - the render system never
// emits these, but hosting must refuse them regardless).
const SELLER_IMAGE = /i\.ebayimg\.com|ebaystatic|\/seller[-_]|thumbs\d*\.ebaystatic|ebayimg/i;

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// The content-addressed storage key. Immutable: same bytes -> same key.
export function storageKeyFor(sha, ext) {
  const e = String(ext || "").toLowerCase();
  const clean = EXT_MIME[e] ? e : ".bin";
  return `by-hash/${sha}${clean}`;
}

export function loadHostedAssets(path = HOSTED_ASSETS_PATH) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("hosted-assets.json is not a JSON array");
  return parsed;
}
export function saveHostedAssets(rows, path = HOSTED_ASSETS_PATH) {
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

export function findByHash(rows, sha) {
  return rows.find((r) => r.sha256 === sha) ?? null;
}
export function findByAssetId(rows, id) {
  return rows.find((r) => r.asset_id === id) ?? null;
}

// May this local artifact be hosted? Pure - takes what the caller already
// read off disk + the artifact's QA/rights.
//   { localPath, bytes, mime, qa, rights, currentRights }
// currentRights = the live lib/social/rights.mjs RIGHTS_STATE object.
export function canHost({ localPath, bytes, mime, qa, rights, currentRights, isSellerImage = false } = {}) {
  const fail = (reason) => ({ ok: false, reason });
  if (!localPath) return fail("no local path");
  if (FORBIDDEN_PATH.test(String(localPath))) return fail(`refusing to host a forbidden path: ${basename(String(localPath))}`);
  if (isSellerImage || SELLER_IMAGE.test(String(localPath))) return fail("looks like eBay seller imagery - never hosted");
  if (!ALLOWED_MIME.includes(mime)) return fail(`mime not allowed for social media: ${mime}`);
  if (!(Number(bytes?.length ?? bytes) > 0)) return fail("empty file");
  const n = Number(bytes?.length ?? bytes);
  if (n > MAX_BYTES) return fail(`file too large: ${n} > ${MAX_BYTES}`);
  if (!qa || qa.ok !== true || (qa.failed?.length ?? 0) > 0) return fail(`QA not passing (${qa ? `${qa.passed ?? "?"}/${qa.total ?? "?"}, failed [${(qa.failed ?? []).join(", ")}]` : "no QA"})`);
  // rights: the artifact's frozen rights_state must match the current
  // source of truth, and the two capabilities the media depends on must
  // be CLEARED.
  if (!rights || typeof rights !== "object") return fail("artifact carries no rights_state");
  if (currentRights) {
    for (const k of Object.keys(currentRights)) {
      if (rights[k] !== currentRights[k]) return fail(`rights drift on "${k}": artifact=${rights[k]} current=${currentRights[k]}`);
    }
  }
  if (rights.ppt_social_data !== "CLEARED") return fail(`ppt_social_data is ${rights.ppt_social_data}`);
  if (rights.card_image !== "CLEARED") return fail(`card_image is ${rights.card_image}`);
  // ebay_seller_images NOT_CLEARED is fine (render system never uses them);
  // ebay_genai NOT_ALLOWED is fine (deterministic). publishing DISABLED is
  // fine - HOSTING IS NOT PUBLISHING.
  return { ok: true, reason: "QA passing + rights in sync + safe media type" };
}

// Build a fresh hosted-asset record (before upload).
export function buildHostedRecord({
  content_id,
  creative_family,
  artifact_type, // "video_916" | "image_45" | "carousel_45"
  platform_eligibility, // [ "instagram_reel", "tiktok", ... ]
  localPath,
  bytes,
  mime,
  width = null,
  height = null,
  durationS = null,
  qa,
  rights,
  sourceCommit = null,
}) {
  const sha = sha256(bytes);
  const ext = extname(String(localPath)) || (mime === "video/mp4" ? ".mp4" : mime === "image/jpeg" ? ".jpg" : ".png");
  const key = storageKeyFor(sha, ext);
  return {
    asset_id: `ha_${sha.slice(0, 24)}`,
    content_id: content_id ?? null,
    creative_family: creative_family ?? null,
    artifact_type: artifact_type ?? null,
    platform_eligibility: platform_eligibility ?? [],
    local_source_path: String(localPath),
    sha256: sha,
    mime_type: mime,
    bytes: Number(bytes.length),
    width,
    height,
    duration_s: durationS,
    storage_provider: null, // set after a real upload
    storage_key: key,
    public_url: null, // set after a real upload
    uploaded_at: null,
    source_commit: sourceCommit,
    qa_verdict: qa ? { ok: qa.ok, passed: qa.passed ?? null, total: qa.total ?? null, failed: qa.failed ?? [] } : null,
    rights_state: rights ?? null,
    verified: null, // { at, status, contentType, contentLength, rangeOk }
    history: [{ at: new Date().toISOString(), note: "record built (not yet uploaded)" }],
  };
}

// Does this hosted record still match the approved local artifact? Used
// as an asset-drift guard before a send: the caller re-reads the local
// file's bytes and passes their sha256.
export function assetMatches(record, localSha) {
  if (!record) return { ok: false, reason: "no hosted asset record" };
  if (!record.public_url) return { ok: false, reason: "hosted asset was never uploaded" };
  if (record.sha256 !== localSha) {
    return { ok: false, reason: `asset drift: hosted sha ${record.sha256.slice(0, 12)}… != local ${String(localSha).slice(0, 12)}… - re-host + re-approve` };
  }
  return { ok: true, reason: "hosted asset checksum matches the local artifact" };
}

// Retention: which orphan rows are safe to delete? A row is PROTECTED if
// any QUEUED/PUBLISHED ledger job freezes its asset_id / url / sha.
//   ledgerRows = the distribution ledger array
//   olderThanDays = only offer rows uploaded more than this many days ago
export function cleanupCandidates(hostedRows, ledgerRows = [], { now = Date.now(), olderThanDays = 30 } = {}) {
  const protectedIds = new Set();
  const protectedUrls = new Set();
  for (const j of ledgerRows) {
    if (!["QUEUED", "PUBLISHED"].includes(j.status)) continue;
    if (j.hosted_asset_id) protectedIds.add(j.hosted_asset_id);
    if (j.public_media_url) protectedUrls.add(j.public_media_url);
  }
  const cutoff = now - olderThanDays * 864e5;
  return hostedRows.filter((r) => {
    if (protectedIds.has(r.asset_id) || protectedUrls.has(r.public_url)) return false;
    const t = r.uploaded_at ? new Date(r.uploaded_at).getTime() : 0;
    return t > 0 && t < cutoff;
  });
}
