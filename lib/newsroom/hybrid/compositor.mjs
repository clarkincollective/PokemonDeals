// Phase SOCIAL-CREATIVE-4B - HYBRID COMPOSITOR (§10) + OUTPUT MODES (§11)
// + CANONICAL ART PROTECTION (§9) + BRANDING RESTRAINT (§12).
//
// This module does NOT run a browser. It resolves the COMPOSITE SPEC that
// the existing deterministic renderer (lib/social/render +
// lib/social/newsroom/cardEditorialTemplates) then rasterises:
//
//   layer 0  AI background (data: URL)         -- decorative, scanned, optional
//   layer 1  canonical card art (file:// URL)  -- IMMUTABLE, inserted here
//   layer 2  deterministic HTML/SVG/data/text  -- 100% from FACT_LOCK / resolvers
//   layer 3  brand mark + disclosure           -- restrained (<= ~5%)
//
// The renderer overlays layers 1-3 exactly as it does today; layer 0 is
// the only new thing and it carries NO facts.

import { createHash } from "node:crypto";
import { failure } from "../editorial/failureStates.mjs";

export const OUTPUT_MODES = Object.freeze(["DETERMINISTIC_ONLY", "HYBRID_BACKGROUND", "AI_DIRECTED_COMPOSITION"]);

// Choose the mode. AI adds no value (and we skip the image call) when:
// there is no director direction, the story is a pure typographic
// explainer, or hybrid is not enabled for this run.
export function chooseOutputMode({ enabled = false, direction = null, layout = null, backgroundOk = false } = {}) {
  if (!enabled) return "DETERMINISTIC_ONLY";
  if (!direction || direction.source === "deterministic") return backgroundOk ? "HYBRID_BACKGROUND" : "DETERMINISTIC_ONLY";
  if (!backgroundOk) return "DETERMINISTIC_ONLY";
  // AI_DIRECTED only when the director asked for a non-trivial composition
  const wantsComposition = direction.layout_intent && /crop|asymmetr|overlap|full-bleed|diagonal|stack|rail|triptych|split/i.test(String(direction.layout_intent));
  return wantsComposition ? "AI_DIRECTED_COMPOSITION" : "HYBRID_BACKGROUND";
}

// §9 - the canonical art guard. `artMap` is { tcgplayerId -> url }. Every
// URL MUST be a file:// (local canonical cache) or the exact hosted
// canonical asset - never a data: URL (which would mean the pixels were
// generated / re-encoded by something) and never an http(s) URL that
// isn't our canonical store. Returns { ok, violations }.
export function assertCanonicalArtUntouched(artMap = {}, { allowHosts = [] } = {}) {
  const violations = [];
  for (const [id, url] of Object.entries(artMap || {})) {
    const u = String(url || "");
    if (!u) { violations.push(`${id}: empty art url`); continue; }
    if (u.startsWith("data:")) { violations.push(`${id}: art is a data: URL - canonical art must never be re-encoded / generated`); continue; }
    if (u.startsWith("file://")) continue;
    if (/^https?:\/\//.test(u)) {
      const host = (() => { try { return new URL(u).host; } catch { return ""; } })();
      if (allowHosts.length && allowHosts.includes(host)) continue;
      violations.push(`${id}: art url host "${host}" is not an allowed canonical store`);
      continue;
    }
    violations.push(`${id}: art url is neither file:// nor an allowed canonical host`);
  }
  return { ok: violations.length === 0, violations };
}

// §12 - branding restraint. `brandBox` + `canvas` are {w,h}. Returns
// { ok, violations, dominance_pct }.
export function validateBranding({ brandBox = null, canvas = { w: 1080, h: 1350 }, coversCardArt = false, styledAsAdBanner = false } = {}) {
  const violations = [];
  let dominance = 0;
  if (brandBox && Number.isFinite(brandBox.w) && Number.isFinite(brandBox.h)) {
    dominance = (brandBox.w * brandBox.h) / (canvas.w * canvas.h);
    if (dominance > 0.05 + 1e-6) violations.push(`brand mark is ${(dominance * 100).toFixed(1)}% of the frame (> 5%)`);
  }
  if (coversCardArt) violations.push("brand mark overlaps / covers the canonical card art");
  if (styledAsAdBanner) violations.push("brand treatment reads as an ad banner");
  return { ok: violations.length === 0, violations, dominance_pct: Math.round(dominance * 1000) / 10 };
}

// §10 - assemble the composite spec. The caller (renderCardForwardStory)
// passes the deterministic props it already computed; we add layer 0 and
// re-assert the invariants. `factOverlaySources` is the list of where the
// deterministic layer's numbers came from - every entry MUST be
// "fact_lock" or "resolver:*". Any other source -> reject.
export function buildCompositeSpec({
  mode = "DETERMINISTIC_ONLY",
  layout,
  target,
  cardArt = {},
  backgroundDataUrl = null,
  backgroundSha = null,
  deterministicProps = {},
  factOverlaySources = [],
  brandBox = null,
  canvas = { w: 1080, h: 1350 },
  allowArtHosts = [],
} = {}) {
  if (!OUTPUT_MODES.includes(mode)) return failure("QA_FAIL", `unknown output mode "${mode}"`);

  const art = assertCanonicalArtUntouched(cardArt, { allowHosts: allowArtHosts });
  if (!art.ok) return failure("QA_FAIL", `canonical art violation: ${art.violations.join("; ")}`, { stage: "compositor", detail: art });

  const badSources = factOverlaySources.filter((s) => !(s === "fact_lock" || /^resolver:/.test(String(s))));
  if (badSources.length) {
    return failure("QA_FAIL", `deterministic fact overlay has non-sanctioned source(s): ${badSources.join(", ")}`, { stage: "compositor" });
  }

  const brand = validateBranding({ brandBox, canvas });
  if (!brand.ok) return failure("QA_FAIL", `branding restraint: ${brand.violations.join("; ")}`, { stage: "compositor", detail: brand });

  const usesBackground = mode !== "DETERMINISTIC_ONLY" && Boolean(backgroundDataUrl);
  if (usesBackground && !String(backgroundDataUrl).startsWith("data:image/")) {
    return failure("QA_FAIL", "background layer must be an inline data: image URL", { stage: "compositor" });
  }

  return Object.freeze({
    ok: true,
    mode: usesBackground ? mode : "DETERMINISTIC_ONLY",
    layout,
    target,
    layers: {
      background: usesBackground ? { data_url: backgroundDataUrl, sha256: backgroundSha } : null,
      canonical_card_art: cardArt, // untouched, file:// only
      deterministic_overlay: deterministicProps, // 100% real facts
      brand: { box: brandBox, dominance_pct: brand.dominance_pct },
    },
    fact_overlay_sources: factOverlaySources,
    composite_sha_input: createHash("sha256")
      .update(JSON.stringify({ layout, target, mode: usesBackground ? mode : "DETERMINISTIC_ONLY", bg: backgroundSha, art: cardArt, props_keys: Object.keys(deterministicProps).sort() }))
      .digest("hex")
      .slice(0, 16),
  });
}

export const COMPOSITOR_VERSION = "4b.1";
