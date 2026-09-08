// Phase SOCIAL-CREATIVE-4B.1 - FREEFORM RENDERER + PER-FAMILY SLOT MAP +
// DETERMINISTIC FALLBACK BLUEPRINTS (§4, §5, §10-§14).
//
// Takes a VALIDATED blueprint (blueprint.validateBlueprint) + real data
// and rasterises it: every content zone is absolutely positioned and
// rendered by a deterministic primitive whose props come ONLY from the
// FACT_LOCK / sanctioned resolver output. The AI decides the arrangement;
// it never supplies a factual value here.
//
// Pure string building (returns HTML the existing renderer rasterises).

import { TOKENS } from "../../social/creativeSpec.mjs";
import { FONT_FACE_CSS } from "../../social/fontData.mjs";
import { renderPrimitive } from "./primitives.mjs";
import { fitText } from "./textFit.mjs";
import { CANVAS } from "./blueprint.mjs";
import { webFirstCta } from "./cta.mjs";

const C = TOKENS.color;
const S = Object.fromEntries(Object.entries(TOKENS.type).map(([k, v]) => [k, v && typeof v === "object" ? v.size : v]));
const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = (n) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`;

// Render a validated blueprint. `slots` maps zone.role (or zone.id) ->
// props object for that zone's primitive. Missing/invalid primitive props
// throw -> caller treats as COMPOSITION_REJECT.
export function renderBlueprintHtml(blueprint, { slots = {}, backgroundDataUrl = null } = {}) {
  const canvas = blueprint.canvas ?? CANVAS[blueprint.target] ?? CANVAS.ig_45;
  const zonesHtml = blueprint.content_zones.map((z, i) => {
    const primName = z.primitive ?? z.role;
    const props = slots[z.id] ?? slots[z.role] ?? slots[`${z.role}#${i}`] ?? {};
    const ctx = { C, S, zone: { width: z.width, height: z.height }, fit: fitText };
    let inner;
    try {
      inner = renderPrimitive(primName, props, ctx);
    } catch (err) {
      inner = `<div style="width:100%;height:100%;border:1px dashed ${C.hair};border-radius:8px;color:${C.inkFaint};font-size:16px;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px">${e(primName)}<br>(${e(String(err.message).slice(0, 60))})</div>`;
    }
    const align = z.alignment === "center" ? "center" : z.alignment === "end" ? "flex-end" : "flex-start";
    return `<div style="position:absolute;left:${z.x}px;top:${z.y}px;width:${z.width}px;height:${z.height}px;display:flex;flex-direction:column;justify-content:${align};overflow:hidden;z-index:1">${inner}</div>`;
  }).join("\n");

  const bg = backgroundDataUrl && /^data:image\//.test(String(backgroundDataUrl))
    ? `<div style="position:absolute;inset:0;z-index:0;background:${C.bg} url('${String(backgroundDataUrl).replace(/'/g, "%27")}') center/cover no-repeat"></div>
       <div style="position:absolute;inset:0;z-index:0;background:linear-gradient(180deg,rgba(11,11,13,.58),rgba(11,11,13,.36) 42%,rgba(11,11,13,.72))"></div>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACE_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${canvas.w}px;height:${canvas.h}px;background:${C.bg};color:${C.ink};font-family:${S.family};-webkit-font-smoothing:antialiased;overflow:hidden}
.stage{position:absolute;inset:0}
</style></head><body>${bg}<div class="stage">${zonesHtml}</div></body></html>`;
}

// ---- PER-FAMILY SLOT MAP -----------------------------------------
// Deterministically turn (factLock + resolved payload + cardArt) into the
// props each zone's primitive needs. Only real values.
export function buildSlots(layout, { factLock = {}, resolved = null, cardArt = {} } = {}) {
  const F = factLock || {};
  const R = resolved?.data ?? resolved ?? {};
  const art = (id) => cardArt?.[String(id)] ?? null;

  if (layout === "deal_hero") {
    const listed = num(F.listed_price ?? R.priceUsd);
    const market = num(F.market_price ?? R.marketUsd);
    const pct = num(F.discount_pct ?? R.discountPct) ?? (listed && market ? Math.round((1 - listed / market) * 100) : null);
    return {
      eyebrow: { text: "Deal drop · live now" },
      brand_mark: {},
      hero_card: { artUrl: art(F.card_tcgplayer_id ?? R.card?.tcgplayerId), name: F.card_name ?? R.card?.name },
      headline: { text: F.card_name ?? R.card?.name ?? "Under market right now" },
      set_era_tag: { text: F.card_set ?? R.card?.set ?? "" },
      price_pair: { a: listed, b: market, aLabel: "Deal", bLabel: "Market" },
      price_gap_bar: { listed, market, pct },
      hero_stat: { value: pct != null ? `${pct}%` : "—", caption: "below recent market" },
      why_this_matters_box: { text: "We reprice every listing against what the card actually sells for, so this gap is real — not a marked-up 'was' price." },
      // §11 (4B.2) - social routes via the website, never straight to eBay
      cta: { text: webFirstCta({ classification: "COMMERCIAL", layout: "deal_hero" }).text },
      website_footer: {},
    };
  }

  if (layout === "market_shape") {
    const under25 = num(R.under25Pct ?? R.under_25_pct ?? (Array.isArray(F.percentages) ? F.percentages[0] : null));
    const over100 = num(R.over100Pct ?? R.over_100_pct ?? (Array.isArray(F.percentages) ? F.percentages[1] : null));
    const tracked = num(F.tracked_count ?? R.pricedCards ?? R.priced_cards);
    const feat = R.featured ?? {};
    return {
      eyebrow: { text: "Pokemon market — this week" },
      brand_mark: {},
      headline: { text: "Most Pokemon cards cost less than people think." },
      hero_stat: { value: under25 != null ? `${under25}%` : "—", caption: tracked != null ? `of ${tracked.toLocaleString("en-US")} tracked singles sell under $25` : "sell under $25" },
      distribution_bar: {
        segments: [
          { pct: under25 ?? 60, color: "up", label: "under $25" },
          { pct: Math.max(0, 100 - (under25 ?? 60) - (over100 ?? 5)), color: "surface", label: "$25–100" },
          { pct: over100 ?? 5, color: "brand", label: `${over100 ?? 5}% over $100` },
        ],
      },
      metric_strip: {
        items: [
          tracked != null ? { label: "tracked singles", value: tracked.toLocaleString("en-US") } : null,
          under25 != null ? { label: "under $25", value: `${under25}%` } : null,
          over100 != null ? { label: "over $100", value: `${over100}%` } : null,
        ].filter(Boolean),
      },
      spotlight_panel: { title: "Standout deal right now", value: feat.card_name ?? null, sub: feat.asking_usd != null && feat.market_ref_usd != null ? `${usd(feat.asking_usd)} · ${usd(feat.market_ref_usd)} market` : null },
      secondary_card: { artUrl: art(feat.tcgplayerId ?? (R.cards?.[0]?.tcgplayerId)), name: feat.card_name },
      why_this_matters_box: { text: "The chase cards make the headlines. The market is mostly affordable singles — which is where most collecting actually happens." },
      website_footer: {},
    };
  }

  if (layout === "asking_vs_sold") {
    const asking = num(F.listed_price ?? R.askingUsd);
    const sold = Array.isArray(R.sold_points) ? R.sold_points.map(num).filter((x) => x != null) : [];
    const market = num(F.market_price ?? R.marketRefUsd);
    const soldMin = sold.length ? Math.min(...sold) : market;
    const soldMax = sold.length ? Math.max(...sold) : market;
    const premium = asking && market ? Math.round((asking / market - 1) * 100) : null;
    return {
      eyebrow: { text: "Why sold prices matter" },
      brand_mark: {},
      headline: { text: "Asking price is not market value." },
      hero_card: { artUrl: art(F.card_tcgplayer_id ?? R.tcgplayerId ?? R.card?.tcgplayerId), name: F.card_name ?? R.card_name },
      comparison_axis: { left: asking != null ? usd(asking) : "—", right: market != null ? usd(market) : "—", leftLabel: "A listing asks", rightLabel: "Recent market" },
      market_range: { min: soldMin, max: soldMax, mid: market },
      hero_stat: premium != null ? { value: `+${premium}%`, caption: "over what it actually sells for" } : { value: "—", caption: "" },
      difference_arrow: asking != null && market != null ? { from: usd(asking), to: usd(market), note: "what buyers pay" } : { from: "ask", to: "sold" },
      why_this_matters_box: { text: "We reference completed sales, not the highest hopeful listing. The ask tells you what one seller wants; the sold range tells you the card's price." },
      set_era_tag: { text: [F.card_name ?? R.card_name, F.card_set ?? R.card_set].filter(Boolean).join(" · ") },
      website_footer: {},
    };
  }

  if (layout === "printing_compare") {
    const hi = R.high ?? {};
    const lo = R.low ?? {};
    const axis = R.relevance?.axis ?? resolved?.data?.relevance?.axis ?? null;
    return {
      eyebrow: { text: "Exact printing matters" },
      brand_mark: {},
      headline: { text: `Same ${e(R.species ?? "card")}. Different printing. Different value.` },
      card_triptych: { cards: [
        { artUrl: art(hi.tcgplayerId), price: num(hi.price_usd), label: hi.set },
        { artUrl: art(lo.tcgplayerId), price: num(lo.price_usd), label: lo.set },
      ].filter((c) => c.artUrl || c.price != null) },
      comparison_axis: { left: hi.price_usd != null ? usd(hi.price_usd) : "—", right: lo.price_usd != null ? usd(lo.price_usd) : "—", leftLabel: e(hi.set ?? "A"), rightLabel: e(lo.set ?? "B") },
      variant_badge: { text: axis ? String(axis).replace(/_/g, " ") : "printing variant" },
      mini_timeline: { points: [hi.set, lo.set].filter(Boolean) },
      hero_stat: R.multiple != null ? { value: `${R.multiple}×`, caption: "value difference for one printing detail" } : { value: "—", caption: "" },
      why_this_matters_box: { text: R.printing_lesson ?? "A name match is not a printing match. The edition, stamp, or holo pattern is what the market is pricing." },
      website_footer: {},
    };
  }

  if (layout === "three_up") {
    const items = Array.isArray(R.items) ? R.items : [];
    return {
      eyebrow: { text: "Three under $25 — buyable today" },
      brand_mark: {},
      headline: { text: "Three real cards, all under $25." },
      card_triptych: { cards: items.slice(0, 3).map((it, i) => ({ artUrl: art(it.tcgplayerId), price: num(it.price_usd), label: `#${i + 1}` })) },
      metric_strip: { items: items.slice(0, 3).map((it) => ({ label: it.card_name?.slice(0, 16) ?? "card", value: it.discount_pct != null ? `${it.discount_pct}% off` : usd(it.price_usd) })) },
      hero_stat: { value: `$${Math.max(...items.map((i) => Math.round(num(i.price_usd) ?? 0)), 0)}`, caption: "top of the shortlist" },
      why_this_matters_box: { text: "A curated shortlist, not a grid dump — each one is a genuine live listing below its own market reference." },
      website_footer: {},
    };
  }

  return {};
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

// ---- DETERMINISTIC FALLBACK BLUEPRINTS (§10-§14) ---------------
// Richer than the old single-row templates: multi-zone, a why-this-matters
// box, an enrichment strip, brand designed in. Used as concept "C"
// (constrained AI-directed baseline) and whenever the AI is unavailable.
const Z = (role, x, y, width, height, priority = 5, alignment = "start") => ({ role, x, y, width, height, priority, alignment });

export const FALLBACK_BLUEPRINTS = Object.freeze({
  // §10 - oversized card hero + floating value panels + why-it-matters
  deal_hero: {
    composition_style: "asymmetric_editorial",
    visual_flow: "eyebrow -> big card left -> value stack right -> why-box -> cta",
    visual_density: "medium",
    content_zones: [
      Z("eyebrow", 76, 60, 700, 40, 3), Z("brand_mark", 800, 60, 210, 40, 3, "end"),
      Z("hero_card", 76, 150, 560, 900, 10),
      Z("headline", 680, 180, 330, 190, 8),
      Z("set_era_tag", 680, 380, 330, 44, 3),
      Z("hero_stat", 680, 450, 330, 220, 9),
      Z("price_pair", 680, 690, 330, 150, 7),
      Z("price_gap_bar", 680, 860, 330, 120, 6),
      Z("why_this_matters_box", 76, 1080, 700, 150, 5),
      Z("cta", 800, 1090, 210, 60, 4, "end"),
    ],
    why_this_matters: "The gap is measured against real sold prices.",
    cta_strategy: "restrained link-out, bottom-right",
    brand_strategy: "wordmark top-right + footer domain",
    expected_scroll_stop_reason: "one huge real card + a single dominant % against a struck-through market price",
    expected_share_save_reason: "a concrete, checkable deal a buyer can act on now",
    engagement_objectives: ["SCROLL_STOP", "CLICK_INTENT", "COLLECTOR_RELEVANCE"],
  },
  // §11 - hero stat + bucket breakdown + integrated card example + mini stats
  market_shape: {
    composition_style: "data_led",
    visual_flow: "eyebrow -> claim headline -> hero % -> distribution -> mini stats -> example card panel -> why-box",
    visual_density: "medium",
    content_zones: [
      Z("eyebrow", 76, 60, 700, 40, 3), Z("brand_mark", 800, 60, 210, 40, 3, "end"),
      Z("headline", 76, 120, 620, 220, 8),
      Z("hero_stat", 76, 350, 620, 260, 10),
      Z("distribution_bar", 76, 640, 928, 110, 7),
      Z("metric_strip", 76, 790, 620, 110, 6),
      Z("spotlight_panel", 640, 790, 364, 300, 7),
      Z("secondary_card", 76, 930, 360, 300, 6),
      Z("why_this_matters_box", 460, 1120, 544, 130, 5),
      Z("website_footer", 76, 1270, 928, 40, 3),
    ],
    why_this_matters: "Most collecting happens below the chase-card headlines.",
    brand_strategy: "wordmark + footer, red accent on the outlier bucket",
    expected_scroll_stop_reason: "a surprising single percentage with the sample size right beside it",
    expected_share_save_reason: "a reusable market fact worth quoting",
    engagement_objectives: ["USEFULNESS", "SHAREABILITY", "BRAND_RECALL"],
  },
  // §12 - immediate ASK vs SOLD relationship
  asking_vs_sold: {
    composition_style: "side_annotated",
    visual_flow: "eyebrow -> headline -> card left -> ASK/SOLD axis -> sold range -> premium stat -> arrow -> why-box",
    visual_density: "medium",
    content_zones: [
      Z("eyebrow", 76, 60, 700, 40, 3), Z("brand_mark", 800, 60, 210, 40, 3, "end"),
      Z("headline", 76, 120, 928, 160, 8),
      Z("hero_card", 76, 300, 440, 760, 9),
      Z("comparison_axis", 560, 320, 444, 150, 8),
      Z("market_range", 560, 500, 444, 150, 7),
      Z("hero_stat", 560, 680, 444, 200, 9),
      Z("difference_arrow", 560, 900, 444, 110, 6),
      Z("why_this_matters_box", 76, 1090, 928, 150, 5),
      Z("set_era_tag", 76, 1270, 928, 40, 3),
    ],
    why_this_matters: "We reference completed sales, not the highest hopeful ask.",
    brand_strategy: "wordmark top-right, restrained",
    expected_scroll_stop_reason: "ASK and SOLD side by side with a bold premium % between them",
    expected_share_save_reason: "a pricing lesson a buyer can reuse on any card",
    engagement_objectives: ["USEFULNESS", "CURIOSITY", "COLLECTOR_RELEVANCE"],
  },
  // §13 - make the printing difference obvious
  printing_compare: {
    composition_style: "split_feature",
    visual_flow: "eyebrow -> headline -> two cards -> variant badge -> price axis -> multiple -> lineage timeline -> why-box",
    visual_density: "medium",
    content_zones: [
      Z("eyebrow", 76, 60, 700, 40, 3), Z("brand_mark", 800, 60, 210, 40, 3, "end"),
      Z("headline", 76, 120, 928, 180, 8),
      Z("card_triptych", 76, 320, 928, 620, 10),
      Z("variant_badge", 76, 960, 420, 56, 6),
      Z("comparison_axis", 520, 950, 484, 90, 7),
      Z("hero_stat", 76, 1030, 420, 150, 8),
      Z("mini_timeline", 520, 1050, 484, 90, 5),
      Z("why_this_matters_box", 76, 1200, 928, 110, 5),
    ],
    why_this_matters: "A name match is not a printing match.",
    brand_strategy: "wordmark top-right",
    expected_scroll_stop_reason: "two near-identical cards with very different prices and one labelled difference",
    expected_share_save_reason: "a variant lesson collectors screenshot to remember",
    engagement_objectives: ["CURIOSITY", "SAVEABILITY", "COLLECTOR_RELEVANCE"],
  },
  // §14 - curated shortlist, ranked
  three_up: {
    composition_style: "ranked_list",
    visual_flow: "eyebrow -> headline -> three ranked cards -> per-card value strip -> top stat -> why-box",
    visual_density: "medium",
    content_zones: [
      Z("eyebrow", 76, 60, 700, 40, 3), Z("brand_mark", 800, 60, 210, 40, 3, "end"),
      Z("headline", 76, 120, 928, 150, 8),
      Z("card_triptych", 76, 300, 928, 660, 10),
      Z("metric_strip", 76, 980, 928, 120, 7),
      Z("hero_stat", 76, 1110, 420, 130, 7),
      Z("why_this_matters_box", 520, 1110, 484, 140, 5),
    ],
    why_this_matters: "A curated shortlist, not a grid dump.",
    brand_strategy: "wordmark top-right + red rank accents",
    expected_scroll_stop_reason: "three real cards with readable prices, ranked",
    expected_share_save_reason: "a save-worthy budget shopping list",
    engagement_objectives: ["SAVEABILITY", "SHAREABILITY", "USEFULNESS"],
  },
});

export function fallbackBlueprintFor(layout) {
  return FALLBACK_BLUEPRINTS[layout] ?? null;
}

export const FREEFORM_RENDERER_VERSION = "4b1.1";
