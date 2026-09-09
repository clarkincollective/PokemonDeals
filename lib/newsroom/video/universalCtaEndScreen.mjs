// Phase SOCIAL-CREATIVE-4C.4 - UNIVERSAL CTA END SCREEN (§26 - §37).
//
// Every finished professional social video ends with the SAME recognisable
// PokemonDealFinder CTA system - a brand signature. A viewer who sees only
// the final screen must understand:
//   WHAT IS THIS?   PokemonDealFinder finds Pokemon card deals & compares prices.
//   WHAT DO I DO?   Go to pokemondealfinder.com.
//
// Built PROGRAMMATICALLY (§35) from: the approved deterministic brand mark
// (components/Logo.js - a magnifier, NEVER a Poke Ball), THREE real
// canonical card PNGs, deterministic typography, fixed CTA text, the fixed
// domain. $0 per video.
//
// §34.1 (owner clarification): the end screen MAY use ONE image-model
// generation for an INITIAL premium background-texture brand asset, max 2
// candidates, OWNER REVIEW REQUIRED, then cached + reused forever. Real
// card art, the domain, the CTA text and the brand identity are NEVER
// AI-invented. Default: OFF - a deterministic premium ground is used.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { failure } from "../editorial/failureStates.mjs";
import { BRAND_MARK_SVG, APPROVED_BRAND } from "../hybrid/brandLock.mjs";
import { canSpend, recordCall } from "../hybrid/budget.mjs";

export const UNIVERSAL_CTA_END_SCREEN_VERSION = "4c5.1";
export const CTA_DOMAIN = APPROVED_BRAND.domain; // "pokemondealfinder.com" - a constant, never generated
// 4C.5 §4 / §28 - the CTA is a conversion moment, NOT a flash. Held ~2.6s.
export const CTA_END_SCREEN_DEFAULT_MS = 2600;
export const CTA_END_SCREEN_MIN_MS = 2400;
export const CTA_END_SCREEN_MAX_MS = 3000;
export const CTA_BRAND_ASSET_CACHE = path.join(".social-preview", "cta-brand-asset");

// §21 / §30 - three deterministic brand-value items with a small premium
// icon each. Safe language only - no "always save money" / no overpromise.
export const CTA_VALUE_POINTS = Object.freeze(["REAL DEALS", "COMPARE PRICES", "COLLECT SMARTER"]);
export const CTA_VALUE_POINT_ICONS = Object.freeze(["magnifier", "scale", "spark"]);
export const CTA_FOOTER = "REAL CARDS.  REAL PRICING.  SMARTER COLLECTING.";

// §37 - primary wording adapts slightly by family; visual design is constant.
export const CTA_VARIANTS = Object.freeze({
  deal_hero: { line1: "SEE THE LIVE DEAL", line2: "" },
  asking_vs_sold: { line1: "COMPARE BEFORE", line2: "YOU BUY" },
  market_shape: { line1: "TRACK POKEMON CARD", line2: "PRICES & DEALS" },
  three_up: { line1: "FIND MORE", line2: "AFFORDABLE CARDS" },
  printing_compare: { line1: "KNOW WHAT YOU'RE", line2: "BUYING" },
});
export const CTA_UNIVERSAL_FALLBACK = Object.freeze({ line1: "FIND MORE LIVE", line2: "POKEMON CARD DEALS" });

// §34 - deterministic evergreen canonical card ids (present in the local
// card-art cache; real TCGplayer product art). Used to fill the CTA fan
// when the story's hero card is not enough for three DISTINCT cards.
export const EVERGREEN_CTA_CARDS = Object.freeze([
  { id: "113669", name: "Charizard" },
  { id: "117701", name: "Pikachu" },
  { id: "151974", name: "Mewtwo" },
  { id: "124026", name: "Umbreon" },
  { id: "107001", name: "Blastoise" },
]);

const CARD_ART_CACHE_DIR = path.join(".social-preview", "card-art-cache");
const isCanonicalCardPath = (p) => {
  const s = String(p ?? "");
  if (/tcgplayer-cdn\.tcgplayer\.com/.test(s)) return true;
  return /[\\/]card-art-cache[\\/]\d+\.jpe?g$/i.test(s) || /[\\/]\d+\.jpe?g$/i.test(s.replace(/\\/g, "/"));
};

// -------------------------------------------------------------
// §34 - deterministic CTA card selection: hero card + evergreen fill,
// no duplicates, prefer visual diversity, all real canonical art.
// -------------------------------------------------------------
export function selectCtaCards({ heroCardId = null, heroCardName = null, cacheDir = CARD_ART_CACHE_DIR, want = 3 } = {}) {
  const pick = [];
  const seen = new Set();
  const tryAdd = (id, name, decorative) => {
    const key = String(id ?? "").trim();
    if (!key || seen.has(key)) return;
    const fp = path.isAbsolute(cacheDir) ? path.join(cacheDir, `${key}.jpg`) : path.join(process.cwd(), cacheDir, `${key}.jpg`);
    if (!existsSync(fp)) return;
    seen.add(key);
    pick.push({ id: key, name: name ?? null, path: fp, decorative: Boolean(decorative), canonical: true });
  };
  if (heroCardId) tryAdd(heroCardId, heroCardName, false); // §34.A the story's own hero card
  for (const c of EVERGREEN_CTA_CARDS) { if (pick.length >= want) break; tryAdd(c.id, c.name, true); }

  // fan geometry: left -6deg, centre 0 (dominant), right +6deg (§29)
  const rot = [-6, 0, 6];
  const scale = [0.92, 1.0, 0.92];
  const fanned = pick.slice(0, want).map((c, i, arr) => ({
    ...c,
    rotation_deg: arr.length === 1 ? 0 : rot[i] ?? 0,
    scale: arr.length === 1 ? 1 : scale[i] ?? 0.92,
    z: i === 1 ? 3 : 2 - Math.abs(1 - i),
  }));
  return { cards: fanned, count: fanned.length, enough: fanned.length >= Math.min(3, want) };
}

// §39 - does the end screen alone tell you what PDF is and where to go?
export function auditCtaPurpose(endScreen = {}) {
  const findings = [];
  const hasBrand = /pokemon\s*deal\s*finder/i.test(endScreen.brand?.wordmark ?? "") || endScreen.brand?.mark === "magnifier";
  const hasDomain = String(endScreen.domain ?? "").toLowerCase() === CTA_DOMAIN;
  const valueClear = (endScreen.value_points ?? []).length >= 2;
  const ctaClear = Boolean((endScreen.primary_cta?.line1 ?? "").trim());
  if (!hasBrand) findings.push("no recognisable PokemonDealFinder brand mark / wordmark");
  if (!hasDomain) findings.push(`domain is "${endScreen.domain}" not ${CTA_DOMAIN}`);
  if (!valueClear) findings.push("fewer than two brand-value points - purpose unclear");
  if (!ctaClear) findings.push("no primary call to action line");
  if (findings.length) return { ok: false, ...failure("CTA_PURPOSE_UNCLEAR_FAIL", findings.join(" | "), { stage: "cta_end_screen" }), findings };
  return { ok: true, findings: [] };
}

// §19 / §38 - every card in the fan must be real canonical art; the CTA
// destination must be the website, never eBay.
export function auditCtaRealAndWebFirst(endScreen = {}) {
  const bad = (endScreen.cards ?? []).filter((c) => c.canonical === false || c.ai_generated === true || !isCanonicalCardPath(c.path));
  if (bad.length) return { ok: false, ...failure("AI_GENERATED_CARD_FAIL", `CTA fan has ${bad.length} non-canonical / AI card image(s): ${bad.map((c) => c.id ?? c.path).join(", ")}`, { stage: "cta_end_screen" }) };
  const blob = `${endScreen.primary_cta?.line1 ?? ""} ${endScreen.primary_cta?.line2 ?? ""} ${endScreen.domain ?? ""} ${endScreen.cta_button ?? ""}`.toLowerCase();
  if (/\bebay\b|view on ebay|bid on ebay|ebay\.com/.test(blob)) return { ok: false, ...failure("VIDEO_EBAY_FIRST_CTA_FAIL", `end screen CTA points at eBay: "${blob.trim()}"`, { stage: "cta_end_screen" }) };
  return { ok: true };
}

/**
 * buildUniversalCtaEndScreen({ family, heroCardId, heroCardName, cacheDir,
 *   durationMs, brandAssetPath })
 *  -> { version, family, cards, value_points, primary_cta, cta_button,
 *       domain, footer, brand, duration_ms, animation, background,
 *       audits, ok, state? }
 */
export function buildUniversalCtaEndScreen({
  family = "deal_hero", heroCardId = null, heroCardName = null,
  cacheDir = CARD_ART_CACHE_DIR, durationMs = CTA_END_SCREEN_DEFAULT_MS,
  brandAssetPath = null,
} = {}) {
  const dur = Math.max(CTA_END_SCREEN_MIN_MS, Math.min(CTA_END_SCREEN_MAX_MS, Math.round(durationMs)));
  const sel = selectCtaCards({ heroCardId, heroCardName, cacheDir });
  const variant = CTA_VARIANTS[family] ?? CTA_UNIVERSAL_FALLBACK;

  const bgApproved = brandAssetPath && existsSync(String(brandAssetPath).replace(/^file:\/\//, ""));
  const endScreen = {
    version: UNIVERSAL_CTA_END_SCREEN_VERSION,
    family,
    cards: sel.cards,
    value_points: [...CTA_VALUE_POINTS],
    primary_cta: variant.line1 ? variant : CTA_UNIVERSAL_FALLBACK,
    universal_fallback: CTA_UNIVERSAL_FALLBACK,
    cta_button: CTA_DOMAIN,
    domain: CTA_DOMAIN,
    footer: CTA_FOOTER,
    brand: { mark: "magnifier", wordmark: `${APPROVED_BRAND.wordmark_pokemon} ${APPROVED_BRAND.wordmark_rest}`, ai_invented: false },
    value_point_icons: [...CTA_VALUE_POINT_ICONS],
    duration_ms: dur,
    hold_ms: dur, // 4C.5 §4/§28 - fully readable for the whole window
    // §20 / §24 / §36 - staggered card entrance, then near-static; value
    // points stagger; headline reads in; URL gets ONE light sweep. No
    // bounce / spin / confetti / flashing.
    animation: [
      { at_ms: 0, end_ms: 420, what: "card fan enters staggered (left x-12 y+10 / centre y+14 / right x+12 y+10), 60ms apart, opacity 0->1" },
      { at_ms: 200, end_ms: 640, what: "brand mark + wordmark settle" },
      { at_ms: 360, end_ms: 820, what: "three value pills stagger in" },
      { at_ms: 620, end_ms: 1080, what: `"${(variant.line1 || CTA_UNIVERSAL_FALLBACK.line1)}" reads in` },
      { at_ms: 1000, end_ms: 1400, what: `${CTA_DOMAIN} panel resolves with a mild glow` },
      { at_ms: 1200, end_ms: 1900, what: `a single soft light-sweep travels across ${CTA_DOMAIN}` },
      { at_ms: 1400, end_ms: dur, what: "cards hold with a 1-2px breathing float; everything readable" },
    ],
    background: bgApproved
      ? { kind: "approved_brand_asset", path: String(brandAssetPath).replace(/^file:\/\//, ""), ai_generated_once: true, owner_approved: true }
      : { kind: "deterministic", note: "premium radial black + a soft red halo behind the card fan + low-opacity grain + vignette - no AI (§25)" },
    reusable: true,
    real_card_selection: { requested: 3, resolved: sel.count, enough: sel.enough },
  };

  const p = auditCtaPurpose(endScreen);
  const rc = auditCtaRealAndWebFirst(endScreen);
  endScreen.audits = { purpose: p.ok ? "PASS" : p.state, real_and_web_first: rc.ok ? "PASS" : rc.state };

  if (!sel.enough) {
    return { ok: false, ...failure("AI_GENERATED_CARD_FAIL", `only ${sel.count} distinct canonical cards resolved for the CTA fan (need 3) - refusing to fill with a redrawn / duplicated card (§34)`, { stage: "cta_end_screen" }), end_screen: endScreen };
  }
  if (!p.ok) return { ok: false, ...p, end_screen: endScreen };
  if (!rc.ok) return { ok: false, ...rc, end_screen: endScreen };
  return { ok: true, state: "CTA_END_SCREEN_READY", end_screen: endScreen };
}

// -------------------------------------------------------------
// RENDER - deterministic premium HTML. cardImages = { <id>: base64Jpeg }.
// No network. The brand mark is the approved magnifier SVG.
// -------------------------------------------------------------
export function renderEndScreenHtml(endScreen, { cardImages = {}, width = 1080, height = 1920, staticFrame = false } = {}) {
  const es = endScreen.end_screen ?? endScreen;
  const C = { bg: "#0a0a0c", ink: "#f6f6f8", red: "#e4483d", panel: "#f4f4f6" };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const bg = es.background?.kind === "approved_brand_asset" && es.background.b64
    ? `background:url('data:image/png;base64,${es.background.b64}') center/cover`
    : `background:radial-gradient(120% 80% at 50% 34%, #1b1b21 0%, ${C.bg} 62%)`;

  const cards = (es.cards ?? []).map((c, i) => {
    const b64 = cardImages[c.id];
    const src = b64 ? `data:image/jpeg;base64,${b64}` : "";
    const cx = 540 + (i - 1) * 236;
    const lift = i === 1 ? 0 : 26;
    return `<div class="ctacard" style="left:${cx - 156}px;top:${lift}px;transform:rotate(${c.rotation_deg}deg) scale(${c.scale});z-index:${c.z}">
      ${src ? `<img src="${src}" alt="">` : `<div class="ph"></div>`}
    </div>`;
  }).join("");

  const vps = (es.value_points ?? []).map((v) => `<span class="vp">${esc(v)}</span>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${width}px;height:${height}px;overflow:hidden;background:${C.bg}}
  .es{position:absolute;inset:0;${bg};font-family:"Helvetica Neue",Arial,system-ui,sans-serif;color:${C.ink}}
  .brand{position:absolute;top:196px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:16px;z-index:6}
  .brand .wm{font-weight:800;font-size:44px;letter-spacing:-0.01em}
  .brand .wm b{color:${C.red}}
  .vps{position:absolute;top:314px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:22px;z-index:6}
  .vp{font-weight:700;font-size:25px;letter-spacing:.05em;color:#d9d9df;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:9px 17px}
  .fan{position:absolute;top:500px;left:0;right:0;height:520px;z-index:2}
  .ctacard{position:absolute;top:0;width:322px;height:451px;border-radius:18px;overflow:hidden;
    box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 60px rgba(228,72,61,.22),0 0 0 2px rgba(255,255,255,.06)}
  .ctacard img{width:100%;height:100%;object-fit:cover;display:block}
  .ctacard .ph{width:100%;height:100%;background:#15151a}
  .cta{position:absolute;left:0;right:0;bottom:462px;text-align:center;z-index:7}
  .cta .l{font-weight:800;font-size:60px;line-height:1.06;letter-spacing:-0.01em;text-transform:uppercase}
  .go{position:absolute;left:96px;right:96px;bottom:300px;background:${C.panel};color:#111;border:4px solid ${C.red};
    border-radius:20px;padding:24px 0;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5);z-index:7}
  .go .u{display:inline-flex;align-items:center;gap:14px;font-weight:800;font-size:44px;letter-spacing:-0.01em}
  .go .u b{color:${C.red}}
  .foot{position:absolute;left:0;right:0;bottom:224px;text-align:center;color:#a9a9b2;font-weight:700;font-size:24px;letter-spacing:.05em;z-index:7}
  ${staticFrame ? "" : `.es *{animation-duration:${es.duration_ms || 1500}ms;animation-timing-function:cubic-bezier(.33,0,.15,1);animation-play-state:paused;animation-fill-mode:both}
  @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fanin{0%{opacity:0}70%{opacity:0}100%{opacity:1}}
  @keyframes glow{0%,72%{box-shadow:0 20px 50px rgba(0,0,0,.5)}100%{box-shadow:0 20px 50px rgba(0,0,0,.5),0 0 42px rgba(228,72,61,.55)}}
  .brand{animation-name:rise}
  .vps{animation-name:rise;animation-delay:180ms}
  .fan{animation-name:fanin}
  .cta{animation-name:rise;animation-delay:640ms}
  .go{animation-name:glow}`}
  </style></head><body><div class="es">
    <div class="brand"><span style="display:inline-flex">${BRAND_MARK_SVG(46)}</span><span class="wm"><b>Pokemon</b> Deal Finder</span></div>
    <div class="vps">${vps}</div>
    <div class="fan">${cards}</div>
    <div class="cta"><div class="l">${esc(es.primary_cta?.line1 ?? "")}</div>${es.primary_cta?.line2 ? `<div class="l">${esc(es.primary_cta.line2)}</div>` : ""}</div>
    <div class="go"><span class="u">${BRAND_MARK_SVG(38)}<span><b>pokemondealfinder</b>.com</span></span></div>
    <div class="foot">${esc(es.footer ?? CTA_FOOTER)}</div>
  </div></body></html>`;
}

// -------------------------------------------------------------
// §34.1 - OPTIONAL one-time AI background-texture brand asset. GATED.
// max 2 candidates. Returns candidates for OWNER REVIEW - it does NOT
// self-approve and does NOT write the approved asset. Real cards / domain
// / CTA text / brand identity are never touched by this.
// -------------------------------------------------------------
export async function generateCtaBrandAssetCandidates({ env = process.env, fetchImpl = fetch, budget = null, max = 2 } = {}) {
  if (String(env.SOCIAL_CTA_BRAND_ASSET_GENERATE) !== "true") {
    return { ok: false, availability: "disabled", note: "set SOCIAL_CTA_BRAND_ASSET_GENERATE=true to generate the one-time CTA background asset (owner review required)" };
  }
  const key = env.OPENAI_API_KEY;
  if (!key) return { ok: false, availability: "no_key" };
  if (budget && !canSpend(budget, "background_generation")) return { ok: false, availability: "budget_exhausted" };
  const n = Math.max(1, Math.min(2, max));
  const prompt =
    "A premium abstract background texture for a Pokemon-card brand end screen. Near-black charcoal ground, one restrained deep-red backlight glow, " +
    "subtle soft vignette, very faint fine grain. NO text, NO logos, NO Poke Ball, NO cards, NO icons, NO shapes that read as a brand mark - " +
    "just a calm dark premium surface. 9:16 vertical.";
  const candidates = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try {
      const res = await fetchImpl("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL || "gpt-image-1", prompt, size: "1024x1536", n: 1 }),
        signal: AbortSignal.timeout(60000),
      });
      if (budget) recordCall(budget, "background_generation", { ok: res.ok, latencyMs: Date.now() - t0, detail: `cta_brand_asset_${i}` });
      if (!res.ok) { candidates.push({ ok: false, status: res.status }); continue; }
      const body = await res.json();
      const b64 = body?.data?.[0]?.b64_json;
      if (b64) candidates.push({ ok: true, b64, mime: "image/png" });
    } catch (e) { candidates.push({ ok: false, error: String(e?.message ?? e).slice(0, 100) }); }
  }
  return {
    ok: candidates.some((c) => c.ok),
    candidates,
    owner_review_required: true,
    note: "OWNER REVIEW REQUIRED - pick one candidate, then write it to " + path.join(CTA_BRAND_ASSET_CACHE, "approved.png") + " and it is reused forever",
  };
}

// helper for the proof / an operator: persist an owner-approved candidate
export function cacheApprovedCtaBrandAsset(b64, { dir = CTA_BRAND_ASSET_CACHE } = {}) {
  mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "approved.png");
  writeFileSync(p, Buffer.from(b64, "base64"));
  return p;
}

export { isCanonicalCardPath as _isCanonicalCardPath };
