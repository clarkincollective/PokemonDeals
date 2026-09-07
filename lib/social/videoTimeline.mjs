// Phase 13E.4 - THE STRUCTURED VIDEO TIMELINE.
//
// A deterministic, data-driven description of a short-form vertical video
// (Instagram Reels / TikTok). It carries NO pixels and NO motion code -
// it is the spec that lib/social/videoDocument.mjs turns into an
// animated HTML document and lib/social/videoRender.mjs rasterises to an
// H.264 MP4 frame by frame. Nothing here does I/O or touches OpenAI.
//
// Every fact on the timeline is copied from an already-verified payload
// (the frozen 13E.3D hook engine / resolveCta / content_goal / real
// canonical card artwork). The timeline never invents a value.

import {
  PLATFORM_TARGETS,
  FAMILIES,
  familyForContentType,
  resolveCta,
  contentGoalFor,
  buildCreativeIdentifiers,
  selectCarouselHook,
} from "./creativeSpec.mjs";

export const VIDEO_FPS = 30;
export const VIDEO_W = 1080;
export const VIDEO_H = 1920;

// reel_9x16 and tiktok_9x16 declare slightly different chrome-safe
// insets. One MASTER serves both platforms by keeping every critical
// element inside the UNION (strictest) of the two. QA checks against
// this rectangle.
export const SHARED_SAFE = Object.freeze({
  top: Math.max(PLATFORM_TARGETS.reel_9x16.safe.top, PLATFORM_TARGETS.tiktok_9x16.safe.top),
  right: Math.max(PLATFORM_TARGETS.reel_9x16.safe.right, PLATFORM_TARGETS.tiktok_9x16.safe.right),
  bottom: Math.max(PLATFORM_TARGETS.reel_9x16.safe.bottom, PLATFORM_TARGETS.tiktok_9x16.safe.bottom),
  left: Math.max(PLATFORM_TARGETS.reel_9x16.safe.left, PLATFORM_TARGETS.tiktok_9x16.safe.left),
});

export const VIDEO_PLATFORMS = Object.freeze(["reel", "tiktok"]);

// the Brand / Conversion video leads with one fixed, claim-free line
// (the featured deal is incidental to the brand story). Kept here so the
// timeline fact and the rendered document state exactly the same words.
export const BRAND_HOOK = "Stop overpaying for Pokemon cards";

// the Market Mover "hook" is the card identity + the real, confident move
// over the stated window - assembled from movement facts, never invented.
function moverHookLine(payload, dealArr) {
  const d = dealArr[0] ?? payload?.subject ?? null;
  const m = payload?.movement ?? null;
  if (!d?.card_name || !m) return null;
  const pct = Math.round(Math.abs(Number(m.pct)) * 100);
  return `${d.card_name}: market reference ${m.direction === "up" ? "up" : "down"} ${pct}% over ${m.windowLabel}`;
}

const ms = (s) => Math.round(s * 1000);
const frames = (durationMs, fps = VIDEO_FPS) => Math.round((durationMs / 1000) * fps);

const UTC_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
});
// The public freshness line. 13E.5D: the payload builder FAILS CLOSED for
// any row past the social ceiling (baseFreshness throws), so a payload
// that exists here always carries a real "Checked <verification time>
// UTC" label. The exact_verified_at fallback is defensive only.
function publicFreshnessLabel(payload, dealArr) {
  const raw = payload?.freshness?.label ?? null;
  if (raw) return raw;
  const verifiedAt = dealArr[0]?.exact_verified_at ?? payload?.freshness?.exactVerifiedAt ?? null;
  const t = verifiedAt ? Date.parse(verifiedAt) : NaN;
  if (Number.isFinite(t)) return `Checked ${UTC_FMT.format(t)} UTC. Availability can change.`;
  return "Availability can change.";
}

// --- per-family scene rhythms (seconds) --------------------------------
// Each is a list of scenes {id, start, end}. Entrances/holds inside a
// scene are expressed as element cues with their own start/dur.

function dealDropScenes() {
  return {
    durationMs: ms(8),
    scenes: [
      { id: "hook", start: 0, end: ms(1.4) },
      { id: "card_reveal", start: ms(0.6), end: ms(2.8) },
      { id: "saving", start: ms(1.8), end: ms(3.4) },
      { id: "price", start: ms(2.8), end: ms(4.2) },
      { id: "hold", start: ms(4.0), end: ms(6.2) },
      { id: "cta", start: ms(6.0), end: ms(8.0) },
    ],
    cues: {
      hook: { start: 0, dur: ms(0.45), anim: "mask_up" },
      card: { start: ms(0.6), dur: ms(0.7), anim: "slide_up" },
      metric: { start: ms(1.8), dur: ms(0.45), anim: "scale_in" },
      price: { start: ms(2.8), dur: ms(0.45), anim: "rise" },
      context: { start: ms(3.2), dur: ms(0.4), anim: "rise" },
      cta: { start: ms(6.0), dur: ms(0.5), anim: "rise" },
    },
    ctaAtMs: ms(6.0),
    disclosureFromMs: 0, // Deal Drop keeps the freshness + Ad line visible throughout
    cardVisibleFromMs: ms(0.6),
  };
}

function marketMoverScenes() {
  return {
    durationMs: ms(10),
    scenes: [
      { id: "hook", start: 0, end: ms(1.2) },
      { id: "card_enter", start: ms(1.0), end: ms(2.6) },
      { id: "chart_draw", start: ms(2.0), end: ms(7.5) },
      { id: "period_values", start: ms(5.0), end: ms(8.0) },
      { id: "cta", start: ms(8.0), end: ms(10.0) },
    ],
    cues: {
      name: { start: 0, dur: ms(0.4), anim: "mask_up" },
      move: { start: ms(0.25), dur: ms(0.5), anim: "scale_in" },
      card: { start: ms(1.0), dur: ms(0.7), anim: "slide_right" },
      chartDrawStart: ms(2.0),
      chartDrawDur: ms(5.0), // path stroke-dashoffset over this window
      period: { start: ms(5.0), dur: ms(0.4), anim: "rise" },
      cta: { start: ms(8.0), dur: ms(0.5), anim: "rise" },
    },
    ctaAtMs: ms(8.0),
    disclosureFromMs: 0,
    cardVisibleFromMs: ms(1.0),
  };
}

// carousel: dynamic. hook (~3.6s) + per-card (~2.2s) + close (~2.6s).
function carouselScenes(cardCount) {
  const n = Math.max(1, cardCount);
  const hookMs = ms(3.6);
  const perCardMs = ms(2.2);
  const closeMs = ms(2.6);
  const scenes = [{ id: "hook", start: 0, end: hookMs }];
  let t = hookMs;
  for (let i = 0; i < n; i++) {
    scenes.push({ id: `card_${i + 1}`, start: t, end: t + perCardMs });
    t += perCardMs;
  }
  scenes.push({ id: "close", start: t, end: t + closeMs });
  return {
    durationMs: t + closeMs,
    scenes,
    hookMs,
    perCardMs,
    closeMs,
    cues: {
      hook: { start: 0, dur: ms(0.45), anim: "mask_up" },
      fan: { start: ms(0.5), dur: ms(0.7), anim: "slide_up" },
      cardIn: { dur: ms(0.55), anim: "slide_up" }, // per-card, offset by scene start
      cardFacts: { dur: ms(0.4), anim: "rise" },
      close: { dur: ms(0.5), anim: "rise" },
    },
    ctaAtMs: t, // close scene start
    disclosureFromMs: 0,
    cardVisibleFromMs: 0,
  };
}

function brandScenes() {
  return {
    durationMs: ms(10),
    scenes: [
      { id: "hook", start: 0, end: ms(1.6) },
      { id: "site_reveal", start: ms(1.0), end: ms(4.0) },
      { id: "benefits", start: ms(3.0), end: ms(7.0) },
      { id: "cta", start: ms(7.0), end: ms(10.0) },
    ],
    cues: {
      hook: { start: 0, dur: ms(0.5), anim: "mask_up" },
      site: { start: ms(1.0), dur: ms(0.8), anim: "scale_in" },
      benefit0: { start: ms(3.0), dur: ms(0.35), anim: "rise" },
      benefit1: { start: ms(3.35), dur: ms(0.35), anim: "rise" },
      benefit2: { start: ms(3.7), dur: ms(0.35), anim: "rise" },
      cta: { start: ms(7.0), dur: ms(0.5), anim: "rise" },
    },
    ctaAtMs: ms(7.0),
    disclosureFromMs: 0,
    cardVisibleFromMs: null,
  };
}

// --- the builder ------------------------------------------------------
// `payload`      - an already-verified 13E.3D payload (carries hook, cta,
//                  content_goal, creative, deal_data, movement?, etc.)
// `family`       - one of FAMILIES (defaults from payload.content_type)
// `platform`     - "reel" | "tiktok" (only affects the platform label +
//                  which safe rect is reported; layout uses SHARED_SAFE)
// `cardArtwork`  - { card:{fileUrl}, tcgplayerId } | { cards:[...] } | null
// `background`   - { assetId, absFile } | null  (an APPROVED OpenAI bg)
// `carousel`     - { distinctCount, distinctPrintings, cards:[{fileUrl,tcgplayerId,dealId,name}], moreCount } (carousel only)
export function buildVideoTimeline({ payload, family, platform = "reel", cardArtwork = null, background = null, carousel = null } = {}) {
  const fam = family || familyForContentType(payload?.content_type) || "deal_drop";
  if (!FAMILIES.includes(fam)) throw new Error(`videoTimeline: unknown family "${fam}"`);
  if (!VIDEO_PLATFORMS.includes(platform)) throw new Error(`videoTimeline: unknown platform "${platform}"`);

  let rhythm;
  if (fam === "market_mover") rhythm = marketMoverScenes();
  else if (fam === "hook_carousel") rhythm = carouselScenes(carousel?.distinctCount ?? (Array.isArray(payload?.deal_data) ? payload.deal_data.length : 1));
  else if (fam === "brand_ad") rhythm = brandScenes();
  else rhythm = dealDropScenes();

  const durationMs = rhythm.durationMs;
  const frameCount = frames(durationMs);

  // resolve the website-first CTA from the payload's real route (never fabricated)
  const cta =
    payload?.cta && payload.cta.url
      ? { variant: payload.cta.variant ?? null, label: payload.cta.label, url: payload.cta.url }
      : resolveCta({ family: fam, contentType: payload?.content_type, route: payload?.destination?.route });

  const hookVariant =
    fam === "hook_carousel"
      ? selectCarouselHook({ count: carousel?.distinctCount ?? 0, rotationKey: String(payload?.generated_at ?? "").slice(0, 10) }).variant
      : payload?.hook?.variant ?? payload?.creative?.hook_variant ?? null;

  const ids =
    payload?.creative ??
    buildCreativeIdentifiers({
      family: fam,
      contentType: payload?.content_type,
      subject: payload?.subject?.display_name,
      generatedAt: payload?.generated_at,
      variant: "V", // "V" marks a video creative id
      hookVariant,
      ctaVariant: cta.variant,
    });

  // deal ids + card ids that actually appear (for QA identity checks)
  const dealArr = Array.isArray(payload?.deal_data) ? payload.deal_data : payload?.deal_data ? [payload.deal_data] : [];
  const sourceCardIds =
    fam === "hook_carousel"
      ? (carousel?.cards ?? []).map((c) => String(c.tcgplayerId)).filter(Boolean)
      : cardArtwork?.tcgplayerId
        ? [String(cardArtwork.tcgplayerId)]
        : dealArr.map((d) => d?.card_tcgplayer_id).filter(Boolean).map(String).slice(0, 1);

  return Object.freeze({
    // identifiers (13E.3D, preserved verbatim into the video)
    content_id: `${ids.content_id}-vid-${platform}`,
    content_goal: payload?.content_goal ?? contentGoalFor(payload?.content_type),
    creative_family: fam,
    hook_variant: hookVariant,
    cta_variant: cta.variant,

    // master format
    platform,
    width: VIDEO_W,
    height: VIDEO_H,
    fps: VIDEO_FPS,
    durationMs,
    frameCount,
    aspect: "9:16",

    // the safe rectangle every critical element must stay inside
    safe: SHARED_SAFE,
    platformSafe: platform === "tiktok" ? PLATFORM_TARGETS.tiktok_9x16.safe : PLATFORM_TARGETS.reel_9x16.safe,

    // structure
    scenes: rhythm.scenes,
    cues: rhythm.cues,
    ctaAtMs: rhythm.ctaAtMs,
    disclosureFromMs: rhythm.disclosureFromMs,
    cardVisibleFromMs: rhythm.cardVisibleFromMs,
    carousel: fam === "hook_carousel" ? { hookMs: rhythm.hookMs, perCardMs: rhythm.perCardMs, closeMs: rhythm.closeMs } : null,

    // FACTS - copied, never recomputed
    facts: {
      hook_text:
        fam === "hook_carousel"
          ? selectCarouselHook({ count: carousel?.distinctCount ?? 0, rotationKey: String(payload?.generated_at ?? "").slice(0, 10) }).text
          : fam === "brand_ad"
            ? BRAND_HOOK
            : fam === "market_mover"
              ? moverHookLine(payload, dealArr)
              : payload?.hook?.text ?? null,
      cta_label: cta.label,
      cta_url: cta.url,
      destination_route: payload?.destination?.route ?? null,
      metric_value: dealArr[0] ? `${Math.round(dealArr[0].discount_pct * 100)}%` : null,
      listed_usd: dealArr[0]?.total_price_usd ?? null,
      reference_usd: dealArr[0]?.market_price ?? null,
      movement: payload?.movement
        ? {
            pct: payload.movement.pct,
            direction: payload.movement.direction,
            windowLabel: payload.movement.windowLabel,
            firstValue: payload.movement.series?.[0]?.v ?? null,
            lastValue: payload.movement.series?.[payload.movement.series.length - 1]?.v ?? null,
            points: payload.movement.series?.length ?? 0,
          }
        : null,
      carousel_count: fam === "hook_carousel" ? (carousel?.distinctCount ?? 0) : null,
      more_count: fam === "hook_carousel" ? (carousel?.moreCount ?? 0) : null,
      disclosure_label: payload?.disclosure?.creativeLabel ?? "Ad",
      freshness_label:
        fam === "market_mover"
          ? "Canonical price history. Card prices can move — not investment advice."
          : publicFreshnessLabel(payload, dealArr),
    },

    // provenance
    source: {
      content_type: payload?.content_type ?? null,
      deal_ids: dealArr.map((d) => d?.id).filter((v) => v != null),
      card_ids: sourceCardIds,
      background_id: background?.assetId ?? null,
      has_real_card: fam === "hook_carousel" ? Boolean((carousel?.cards ?? []).length) : Boolean(cardArtwork?.card || (cardArtwork?.cards ?? []).length),
    },

    // future audio: cue points a later phase can hang a sound bed / SFX /
    // VO onto. NO audio is added in 13E.4; the video is fully legible
    // sound-off.
    audio: {
      required: false,
      cues: [
        { at: 0, id: "hook_in", hint: "impact / whoosh under the hook reveal" },
        { at: rhythm.cues?.card?.start ?? rhythm.cues?.fan?.start ?? ms(0.6), id: "card_in", hint: "soft riser under the card entrance" },
        { at: rhythm.ctaAtMs, id: "cta_in", hint: "confirm tick under the CTA" },
      ],
    },
  });
}

// deterministic scene lookup for QA / the document renderer
export function sceneAt(timeline, tMs) {
  return timeline.scenes.find((s) => tMs >= s.start && tMs < s.end) ?? timeline.scenes[timeline.scenes.length - 1];
}
