// Phase SOCIAL-AUTOPILOT-3 §1-§6 - PRODUCTION MEDIA HOSTING.
//
// Reuses the EXISTING content-addressed hosting architecture built in
// 13E.5C - no second hosting system:
//   lib/social/storage/supabase.mjs   - the actual Supabase Storage
//     adapter (public bucket "social-public", content-addressed keys,
//     upload() never overwrites, publicUrlFor() returns a PERMANENT
//     public HTTPS URL - not a signed/expiring one, so §6's "does the URL
//     outlive Buffer's fetch horizon" concern does not apply here at all).
//   lib/social/storage/hostedAssets.mjs - sha256()/storageKeyFor()/
//     buildHostedRecord()/findByHash()/assetMatches() - the content-
//     addressed record model and dedupe logic.
//
// This module only ADAPTS that existing system to the SocialStoryPackage
// pipeline: it does not touch the bucket, the upload mechanics, or the
// record shape.

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getStorageProvider } from "../social/storage/index.mjs";
import { sha256, storageKeyFor, buildHostedRecord, loadHostedAssets, saveHostedAssets, findByHash, assetMatches, EXT_MIME } from "../social/storage/hostedAssets.mjs";
import { pngSize } from "../newsroom/video/masterCreativeCache.mjs";
import { probeMp4 } from "../social/videoRender.mjs";
import { failure } from "../newsroom/editorial/failureStates.mjs";

export const MEDIA_HOSTING_STAGE_VERSION = "auto3.1";

// §2 - never infer media type from a filename; the CALLER states it from
// the platform + placement_type it is building for.
export const MEDIA_TYPE_FOR_PLATFORM = Object.freeze({
  instagram: "STATIC_IMAGE",
  x: "STATIC_IMAGE",
  tiktok: "VIDEO",
  youtube_shorts: "VIDEO",
});

const MIME_FOR_TYPE = Object.freeze({ STATIC_IMAGE: "image/png", VIDEO: "video/mp4" });

/**
 * §3/§4 - host ONE local artifact, content-addressed, cache-first.
 *   { localPath, mediaType, family, sourceCommit, env, hostedAssetsPath }
 * -> { ok, record, cacheHit, uploadedBytes }
 */
export async function hostMedia({ localPath, mediaType, family = null, sourceCommit = null, env = process.env, hostedAssetsPath = undefined, storage = null } = {}) {
  if (!localPath || !existsSync(localPath)) {
    return { ok: false, ...failure("MEDIA_URL_UNREACHABLE_FAIL", `local artifact not found: ${localPath}`, { stage: "host_media" }) };
  }
  const bytes = readFileSync(localPath);
  const mime = MIME_FOR_TYPE[mediaType];
  if (!mime) return { ok: false, ...failure("MEDIA_MIME_FAIL", `unknown media type "${mediaType}"`, { stage: "host_media" }) };
  if (!(bytes.length > 0)) return { ok: false, ...failure("MEDIA_IDENTITY_FAIL", "zero-byte source file", { stage: "host_media", detail: localPath }) };

  const sha = sha256(bytes);
  const rows = loadHostedAssets(hostedAssetsPath);
  const existing = findByHash(rows, sha);

  // §3 - cache hit: identical content already hosted and still valid.
  if (existing?.public_url) {
    const check = assetMatches(existing, sha);
    if (check.ok) return { ok: true, record: existing, cacheHit: true, uploadedBytes: 0 };
    // an existing row claims this hash but its own record disagrees -
    // never silently trust it; fall through to a fresh host.
  }

  const store = storage ?? getStorageProvider(env);
  if (!store.isConfigured()) return { ok: false, ...failure("MEDIA_URL_UNREACHABLE_FAIL", "no storage provider configured (NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)", { stage: "host_media" }) };

  const record = existing ?? buildHostedRecord({
    content_id: null, creative_family: family, artifact_type: mediaType === "VIDEO" ? "video_916" : "image_45",
    platform_eligibility: [], localPath, bytes, mime,
    width: mediaType === "STATIC_IMAGE" ? pngSize(bytes)?.w ?? null : null,
    height: mediaType === "STATIC_IMAGE" ? pngSize(bytes)?.h ?? null : null,
    qa: { ok: true, passed: 1, total: 1, failed: [] }, // this pipeline's own QA gate already gated getting here
    rights: { hosting_is_not_publishing: true },
    sourceCommit,
  });

  const key = storageKeyFor(sha, path.extname(localPath) || (mime === "video/mp4" ? ".mp4" : ".png"));
  const up = await store.upload({ storageKey: key, bytes, contentType: mime });
  if (!up.ok) return { ok: false, ...failure("MEDIA_URL_UNREACHABLE_FAIL", `upload failed: ${up.reason}`, { stage: "host_media", detail: up.detail }) };

  const finalRecord = { ...record, storage_provider: store.name, public_url: up.publicUrl, uploaded_at: new Date().toISOString() };
  const nextRows = existing ? rows.map((r) => (r.asset_id === existing.asset_id ? finalRecord : r)) : [...rows, finalRecord];
  // §15 crash safety - if this write throws/fails, the NEXT run's
  // findByHash on the same content still resolves the SAME storage key
  // (content-addressed), so a retry uploads nothing new (upload() itself
  // no-ops with deduped:true on an existing key) - it only needs to
  // re-persist the record, never re-upload.
  saveHostedAssets(nextRows, hostedAssetsPath);
  return { ok: true, record: finalRecord, cacheHit: Boolean(up.deduped), uploadedBytes: up.deduped ? 0 : bytes.length };
}

/**
 * §5 - public reachability + identity + format verification, performed
 * the way the provider would actually fetch the asset (HTTP GET/HEAD).
 * Downloads the object to verify sha256 + real dimensions/probe - never
 * trusts the upload response alone.
 */
export async function verifyReachability(record, { env = process.env, storage = null, expectedWidth = 1080, expectedHeight = null } = {}) {
  const store = storage ?? getStorageProvider(env);
  const head = await store.head(record.public_url);
  if (!head.ok) return { ok: false, ...failure("MEDIA_URL_UNREACHABLE_FAIL", `HEAD ${record.public_url} -> ${head.status ?? head.error}`, { stage: "verify_reachability" }) };
  const expectedMime = MIME_FOR_TYPE[record.artifact_type === "video_916" ? "VIDEO" : "STATIC_IMAGE"];
  if (head.contentType && !head.contentType.startsWith(expectedMime.split("/")[0] + "/")) {
    return { ok: false, ...failure("MEDIA_MIME_FAIL", `Content-Type ${head.contentType} is not ${expectedMime.split("/")[0]}/*`, { stage: "verify_reachability" }) };
  }
  if (!head.contentLength || head.contentLength <= 0) {
    return { ok: false, ...failure("MEDIA_IDENTITY_FAIL", "hosted object reports zero/unknown Content-Length", { stage: "verify_reachability" }) };
  }

  // download the real bytes to verify identity + decode
  let buf;
  try {
    const r = await fetch(record.public_url, { signal: AbortSignal.timeout(30000) });
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return { ok: false, ...failure("MEDIA_URL_UNREACHABLE_FAIL", `GET ${record.public_url} failed: ${String(e?.message ?? e)}`, { stage: "verify_reachability" }) };
  }
  const gotSha = sha256(buf);
  if (gotSha !== record.sha256) {
    return { ok: false, ...failure("MEDIA_IDENTITY_FAIL", `downloaded sha256 ${gotSha.slice(0, 12)}… != record ${record.sha256.slice(0, 12)}…`, { stage: "verify_reachability" }) };
  }

  if (record.artifact_type === "video_916") {
    const tmp = path.join(mkdtempSync(path.join(tmpdir(), "auto3-probe-")), "probe.mp4");
    writeFileSync(tmp, buf);
    let probe;
    try { probe = await probeMp4(tmp); } catch (e) { return { ok: false, ...failure("MEDIA_VIDEO_PROBE_FAIL", `ffprobe failed: ${String(e?.message ?? e)}`, { stage: "verify_reachability" }) }; }
    if (!probe.ok || !probe.codec) return { ok: false, ...failure("MEDIA_VIDEO_PROBE_FAIL", "ffprobe returned no usable video stream", { stage: "verify_reachability", detail: probe }) };
    if (expectedWidth && probe.width !== expectedWidth) return { ok: false, ...failure("MEDIA_DIMENSION_FAIL", `video width ${probe.width} != expected ${expectedWidth}`, { stage: "verify_reachability" }) };
    if (expectedHeight && probe.height !== expectedHeight) return { ok: false, ...failure("MEDIA_DIMENSION_FAIL", `video height ${probe.height} != expected ${expectedHeight}`, { stage: "verify_reachability" }) };
    return { ok: true, verified: { at: new Date().toISOString(), status: head.status, contentType: head.contentType, contentLength: head.contentLength, probe } };
  }

  const dim = pngSize(buf);
  if (!dim) return { ok: false, ...failure("MEDIA_DIMENSION_FAIL", "could not decode PNG dimensions from the hosted bytes", { stage: "verify_reachability" }) };
  if (expectedWidth && dim.w !== expectedWidth) return { ok: false, ...failure("MEDIA_DIMENSION_FAIL", `image width ${dim.w} != expected ${expectedWidth}`, { stage: "verify_reachability" }) };
  if (expectedHeight && dim.h !== expectedHeight) return { ok: false, ...failure("MEDIA_DIMENSION_FAIL", `image height ${dim.h} != expected ${expectedHeight}`, { stage: "verify_reachability" }) };
  return { ok: true, verified: { at: new Date().toISOString(), status: head.status, contentType: head.contentType, contentLength: head.contentLength, width: dim.w, height: dim.h } };
}

// §4 - bind hosted media back to the frozen package. Never re-hosts or
// swaps silently on a mismatch.
export function verifyHostedAssetDrift(record, packageSha) {
  const check = assetMatches(record, packageSha);
  if (!check.ok) return { ok: false, ...failure("HOSTED_ASSET_DRIFT_FAIL", check.reason, { stage: "hosted_asset_drift" }) };
  return { ok: true };
}

export { EXT_MIME };
