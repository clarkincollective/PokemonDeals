// Phase 13E.2 - the APPROVED GENERATED-ASSET LOADER + deterministic
// selector used by `npm run social:daily`.
//
// This module:
//   - reads the local manifest (assets/social/generated/social-assets.json)
//   - exposes ONLY assets whose status is "approved" AND whose 5 human
//     QA checks all PASS AND whose PNG file actually exists on disk
//   - picks one deterministically per content family per day (stable
//     rotation, SS14) - no randomness, no per-run drift
//   - returns null whenever anything is missing / invalid, so the caller
//     falls back to the existing Mode-B deterministic template (SS15)
//
// It makes NO network call, imports nothing from the live data layer,
// and never reads an environment variable. `social:daily` therefore
// makes ZERO image-generation API calls (SS18): the only thing it does
// with OpenAI output is read PNGs that were generated and approved
// earlier by the separate `npm run social:assets` command.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ASSET_FAMILIES, STYLE_FAMILIES, COMPOSITION_ZONES } from "./assetPrompts.mjs";

export const GENERATED_ASSET_DIR = path.join("assets", "social", "generated");
export const MANIFEST_PATH = path.join(GENERATED_ASSET_DIR, "social-assets.json");

// daily content family -> reusable asset category (SS14). Kept here (not
// in dailyMix) so the mapping is testable in isolation.
export const ASSET_CATEGORY_FOR_CONTENT_TYPE = Object.freeze({
  deal_of_day: "deal_intelligence",
  just_found: "just_found",
  pokemon_spotlight: "pokemon_watch",
  set_spotlight: "set_watch",
  market_snapshot: "market_watch",
  best_deals_found_today: "deal_intelligence",
});

// The 5 human-review checks (SS17). ALL must be true for an asset to
// enter rotation.
export const QA_CHECKS = Object.freeze([
  "generated_background", // the background itself is acceptable
  "copyright_risk", // PASS = no IP / brand / character risk
  "brand_fit", // PASS = on-brand, premium, right register
  "text_legibility", // PASS = overlay zone has room + contrast
  "ai_artifact", // PASS = no obvious AI artefacting / malformed shapes
]);

// --- manifest load + validation ----------------------------------------

export function loadAssetManifest(manifestPath = MANIFEST_PATH, { cwd = process.cwd() } = {}) {
  const abs = path.isAbsolute(manifestPath) ? manifestPath : path.join(cwd, manifestPath);
  if (!existsSync(abs)) return { manifest: null, error: `manifest not found at ${manifestPath}` };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8"));
  } catch (e) {
    return { manifest: null, error: `manifest is not valid JSON: ${e.message}` };
  }
  if (!parsed || !Array.isArray(parsed.assets)) {
    return { manifest: null, error: "manifest has no `assets` array" };
  }
  return { manifest: parsed, error: null };
}

// Returns [] when the entry is well-formed, otherwise a list of problems.
export function validateAssetEntry(entry) {
  const problems = [];
  if (!entry || typeof entry !== "object") return ["entry is not an object"];
  if (typeof entry.id !== "string" || !entry.id) problems.push("missing id");
  if (!ASSET_FAMILIES.includes(entry.category)) problems.push(`bad category "${entry.category}"`);
  if (entry.style != null && !STYLE_FAMILIES.includes(entry.style)) problems.push(`bad style "${entry.style}"`);
  if (entry.zone != null && !COMPOSITION_ZONES.includes(entry.zone)) problems.push(`bad zone "${entry.zone}"`);
  if (entry.aspect_ratio !== "4:5") problems.push(`aspect_ratio must be "4:5"`);
  if (!entry.safe_zones || !Array.isArray(entry.safe_zones.clear)) problems.push("missing safe_zones.clear");
  const okStatus = ["planned", "generated", "approved", "rejected"];
  if (!okStatus.includes(entry.status)) problems.push(`bad status "${entry.status}"`);
  if (entry.status === "approved") {
    if (typeof entry.file !== "string" || !entry.file) problems.push("approved entry has no file");
    if (!entry.qa || typeof entry.qa !== "object") problems.push("approved entry has no qa block");
    else {
      for (const c of QA_CHECKS) {
        if (entry.qa[c] !== "PASS" && entry.qa[c] !== "REJECT") problems.push(`qa.${c} must be PASS|REJECT`);
      }
    }
  }
  return problems;
}

// --- deterministic selection -----------------------------------------------

// FNV-1a 32-bit - tiny, dependency-free, stable across platforms/runs.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function qaAllPass(entry) {
  return entry.qa && QA_CHECKS.every((c) => entry.qa[c] === "PASS");
}

// Every asset that is genuinely usable RIGHT NOW for one category:
// approved + all QA PASS + file present on disk. Sorted by id so the
// rotation index is stable.
export function approvedAssetsForCategory(manifest, category, { cwd = process.cwd(), existsFn } = {}) {
  const exists = existsFn ?? ((rel) => existsSync(path.join(cwd, rel)));
  if (!manifest || !Array.isArray(manifest.assets)) return [];
  return manifest.assets
    .filter((a) => a.category === category)
    .filter((a) => a.status === "approved")
    .filter((a) => validateAssetEntry(a).length === 0)
    .filter((a) => qaAllPass(a))
    .filter((a) => typeof a.file === "string" && exists(a.file))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// Deterministic pick for one daily post. Same contentType + same
// rotationKey (the generation date, YYYY-MM-DD) -> same asset every run.
// Rotates day to day; never random. Returns the manifest entry or null.
export function pickAssetForContentType(contentType, { manifest, rotationKey, cwd = process.cwd(), existsFn } = {}) {
  const category = ASSET_CATEGORY_FOR_CONTENT_TYPE[contentType];
  if (!category) return null;
  const candidates = approvedAssetsForCategory(manifest, category, { cwd, existsFn });
  if (!candidates.length) return null;
  const key = `${category}:${rotationKey ?? ""}`;
  const idx = fnv1a(key) % candidates.length;
  return candidates[idx];
}

// A resolved, render-ready background handle, or null to signal Mode-B
// fallback. `file` is repo-relative; `absFile` is what the renderer needs.
export function resolveBackgroundForPost(payload, { manifest, cwd = process.cwd(), existsFn } = {}) {
  const rotationKey = String(payload?.generated_at ?? new Date().toISOString()).slice(0, 10);
  const entry = pickAssetForContentType(payload?.content_type, { manifest, rotationKey, cwd, existsFn });
  if (!entry) return null;
  return {
    assetId: entry.id,
    category: entry.category,
    style: entry.style ?? null,
    zone: entry.zone ?? null,
    file: entry.file,
    absFile: path.isAbsolute(entry.file) ? entry.file : path.join(cwd, entry.file),
    safeZones: entry.safe_zones ?? null,
    rotationKey,
  };
}

export { fnv1a as _fnv1a };
