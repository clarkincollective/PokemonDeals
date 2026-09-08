// Phase SOCIAL-CREATIVE-4C.2 - MASTER CREATIVE CACHE (§4, §5, §24, §26).
//
// ONE premium master creative per story. The video layer REUSES it and
// animates it locally - it does NOT regenerate 3-5 scene boards. If the
// same story_id + same semantic_hash already has an approved master, the
// video costs $0 in image generation.
//
// The cache is a local directory of <key>.png + <key>.json packages. It is
// deliberately simple + file-based so this phase does not block on a DB
// migration (§28). Pure fs, no OpenAI here.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const MASTER_CACHE_VERSION = "4c2.1";
export const DEFAULT_CACHE_DIR = ".social-preview/master-cache";

const sha256File = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const sha256Buf = (b) => createHash("sha256").update(b).digest("hex");
const safe = (s) => String(s ?? "").replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 120);

// PNG width/height from the IHDR chunk (bytes 16-24, big-endian). Returns
// null for a non-PNG (the renderer then falls back to a default AR).
export function pngSize(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

export function masterCacheKey({ storyId, semanticHash }) {
  return `${safe(storyId)}__${safe(semanticHash)}`;
}

function cacheDir(dir) {
  const d = dir || process.env.MASTER_CREATIVE_CACHE_DIR || DEFAULT_CACHE_DIR;
  return path.isAbsolute(d) ? d : path.join(process.cwd(), d);
}

/**
 * The canonical creative package per story (§4).
 *   { story_id, semantic_hash, master_image_path, master_image_sha256,
 *     card_assets, fact_manifest, visualization_manifest, brand_asset,
 *     caption_handoff, created_at, verification, motion_version? }
 */
export function getMasterCreative({ storyId, semanticHash, dir = null } = {}) {
  const D = cacheDir(dir);
  const key = masterCacheKey({ storyId, semanticHash });
  const jsonP = path.join(D, `${key}.json`);
  const pngP = path.join(D, `${key}.png`);
  if (!existsSync(jsonP) || !existsSync(pngP)) return null;
  let pkg;
  try { pkg = JSON.parse(readFileSync(jsonP, "utf8")); } catch { return null; }
  // integrity: the stored sha must still match the file on disk (§26)
  const actual = sha256File(pngP);
  if (pkg.master_image_sha256 && pkg.master_image_sha256 !== actual) return null;
  return Object.freeze({ ...pkg, master_image_path: pngP, master_image_sha256: actual, _cache_hit: true });
}

/**
 * Store a master creative package. Refuses to overwrite an identical
 * key+sha entry (dedupe - §26). `imageBufferOrPath` is a Buffer or a path
 * to the approved master PNG.
 */
export function putMasterCreative(pkg, { dir = null, imageBufferOrPath = null } = {}) {
  const D = cacheDir(dir);
  mkdirSync(D, { recursive: true });
  const key = masterCacheKey({ storyId: pkg.story_id, semanticHash: pkg.semantic_hash });
  const jsonP = path.join(D, `${key}.json`);
  const pngP = path.join(D, `${key}.png`);

  const buf = Buffer.isBuffer(imageBufferOrPath)
    ? imageBufferOrPath
    : imageBufferOrPath
      ? readFileSync(String(imageBufferOrPath).replace(/^file:\/\//, ""))
      : (pkg.master_image_path ? readFileSync(String(pkg.master_image_path).replace(/^file:\/\//, "")) : null);
  if (!buf) throw new Error("putMasterCreative: no master image buffer/path supplied");
  const sha = sha256Buf(buf);

  if (existsSync(jsonP) && existsSync(pngP)) {
    const prev = getMasterCreative({ storyId: pkg.story_id, semanticHash: pkg.semantic_hash, dir: D });
    if (prev && prev.master_image_sha256 === sha) {
      return { ...prev, _deduped: true }; // §26 - do not regenerate / rewrite
    }
  }

  writeFileSync(pngP, buf);
  const dim = pngSize(buf);
  const record = Object.freeze({
    master_cache_version: MASTER_CACHE_VERSION,
    story_id: pkg.story_id,
    semantic_hash: pkg.semantic_hash,
    family: pkg.family ?? null,
    master_image_path: pngP,
    master_image_sha256: sha,
    image_w: dim?.w ?? null,
    image_h: dim?.h ?? null,
    // does the master image ALREADY carry the approved PokemonDealFinder
    // brand mark (a 5A.1 / FULL_GENERATIVE_SOCIAL final does; a raw board
    // does not)? The motion doc then does NOT add its own corner chip.
    brand_in_master: pkg.brand_in_master ?? false,
    card_assets: pkg.card_assets ?? [],
    fact_manifest: pkg.fact_manifest ?? null,
    visualization_manifest: pkg.visualization_manifest ?? null,
    card_metadata_lock: pkg.card_metadata_lock ?? null,
    brand_asset: pkg.brand_asset ?? "approved_corner_chip",
    caption_handoff: pkg.caption_handoff ?? null,
    verification: pkg.verification ?? {},
    motion_version: pkg.motion_version ?? null,
    created_at: pkg.created_at ?? new Date().toISOString(),
    source: pkg.source ?? "unknown",
  });
  writeFileSync(jsonP, JSON.stringify(record, null, 2));
  return { ...record, _stored: true };
}

/**
 * Seed the cache from an ALREADY-approved static master image (e.g. a
 * BUFFER_READY FULL_GENERATIVE_SOCIAL / 5A.1 artifact). No generation.
 */
export function registerExistingMaster({
  storyId, semanticHash, family, imagePath,
  cardAssets = [], factManifest = null, visualizationManifest = null,
  cardMetadataLock = null, captionHandoff = null, verification = {}, source = "approved_artifact",
  brandInMaster = true, dir = null,
} = {}) {
  return putMasterCreative(
    {
      story_id: storyId, semantic_hash: semanticHash, family,
      card_assets: cardAssets, fact_manifest: factManifest, visualization_manifest: visualizationManifest,
      card_metadata_lock: cardMetadataLock, caption_handoff: captionHandoff, brand_in_master: brandInMaster,
      verification: { ...verification, source_kind: "pre-approved" }, source,
    },
    { dir, imageBufferOrPath: imagePath },
  );
}

export function listMasters({ dir = null } = {}) {
  const D = cacheDir(dir);
  if (!existsSync(D)) return [];
  return readdirSync(D).filter((f) => f.endsWith(".json")).map((f) => {
    try { return JSON.parse(readFileSync(path.join(D, f), "utf8")); } catch { return null; }
  }).filter(Boolean);
}

// §26 - is a previously-rendered video still valid for this master + motion?
export function videoLayersCurrent({ masterSha, motionVersion, prev }) {
  return Boolean(prev && prev.master_sha === masterSha && prev.motion_version === motionVersion);
}
