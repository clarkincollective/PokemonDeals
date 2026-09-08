#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-3 - `npm run social:creative-pack`
//
// Builds a REAL, card-forward creative review pack:
//   real data (lib/social/newsroom/marketData) + real canonical card art
//   (lib/social/cardArtwork) -> card-forward render
//   (lib/social/newsroom/cardEditorialTemplates) -> deterministic
//   editorial QA + COLLECTIBLE_APPEAL gate + 3-sample worst-case Layer-5
//   -> thumbnail / 25% / mobile previews + a next-9 feed grid + a
//   per-asset scorecard.
//
// NOTHING is published, scheduled, hosted, or written to Buffer.
// No verify-deals change. No Stage 1. No email.
//
//   node scripts/socialCreativePack.mjs [--json] [--samples N]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { createRenderer } from "../lib/social/render.mjs";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { resolveCardArtwork } from "../lib/social/cardArtwork.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { sha256 } from "../lib/social/storage/hostedAssets.mjs";
import { pathToFileURL } from "node:url";

import { renderCardEditorialHtml, CARD_TARGETS, CARD_LAYOUTS } from "../lib/social/newsroom/cardEditorialTemplates.mjs";
import { collectibleAppeal, CARD_SPECIFIC_FAMILIES } from "../lib/social/newsroom/collectibleAppeal.mjs";
import { CARD_LAYOUT_STATUS, AUTONOMOUS_SAFE_CARD_LAYOUTS, MANUAL_ONLY_CARD_LAYOUTS } from "../lib/social/newsroom/cardLayoutStatus.mjs";
import { editorialCreativeQa } from "../lib/social/newsroom/editorialQa.mjs";
import * as MD from "../lib/social/newsroom/marketData.mjs";
import { reviewRenderedCreativeMulti, reviewAvailable } from "../lib/newsroom/visualReview.mjs";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const SAMPLES = Number((args[args.indexOf("--samples") + 1] ?? "").match(/^\d+$/)?.[0] || 5);
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-3");
const RENDERS = path.join(OUT, "renders");
const log = (...a) => { if (!JSON_OUT) console.log(...a); };

// --- resolve canonical art for a list of { tcgplayerId, card_name?, card_set?, catalog? } ---
async function resolveArt(cards) {
  const db = supabaseAdmin();
  const ids = [...new Set(cards.map((c) => String(c.tcgplayerId)))].filter((id) => /^\d+$/.test(id));
  const { data: cat } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").in("tcgplayer_id", ids);
  const catById = Object.fromEntries((cat ?? []).map((r) => [String(r.tcgplayer_id).trim(), r]));
  const map = {};
  const ready = [];
  for (const id of ids) {
    const row = catById[id];
    const pseudoDeal = { card_tcgplayer_id: id, card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null };
    const r = await resolveCardArtwork(pseudoDeal, { rightsState: RIGHTS_STATE, catalogRow: row ?? null });
    if (r.status === "ready") { map[id] = pathToFileURL(path.resolve(r.localPath)).href; ready.push(id); }
  }
  return { map, readyIds: ready };
}

// --- family builders: (real data) -> { layout, props, meta bits } ---
async function buildFamilies() {
  const out = [];
  const push = (o) => out.push(o);

  // MARKET (market_shape) - from real catalogue distribution + featured deal
  {
    const r = await MD.resolveMarketShape();
    if (r.ok) push({ series: "MARKET_SNAPSHOT", layout: "market_shape", category: "MARKET", cards: r.cards, dataOk: true, props: {
      pricedCards: r.data.priced_cards, under25Pct: r.data.under_25_pct, over100Pct: r.data.over_100_pct, featured: r.data.featured,
    }, numeric: [r.data.priced_cards, r.data.under_25_pct, r.data.over_100_pct, r.data.featured?.asking_usd].filter(Boolean), priceContrast: Boolean(r.data.featured) });
    else push({ series: "MARKET_SNAPSHOT", layout: "market_shape", category: "MARKET", withheld: r.reason, detail: r.detail });
  }
  // EDUCATION (asking_vs_sold)
  {
    const r = await MD.resolveAskingVsSold();
    if (r.ok) push({ series: "WHY_SOLD_PRICES_MATTER", layout: "asking_vs_sold", category: "EDUCATION", cards: r.cards, dataOk: true, props: {
      card: { tcgplayerId: r.data.tcgplayerId, name: r.data.card_name, set: r.data.card_set }, askingUsd: r.data.asking_usd, soldPoints: r.data.sold_points, marketRefUsd: r.data.market_ref_usd,
    }, species: r.data.card_name, numeric: [r.data.asking_usd, ...r.data.sold_points], priceContrast: true, cardSpecific: true });
    else push({ series: "WHY_SOLD_PRICES_MATTER", layout: "asking_vs_sold", category: "EDUCATION", withheld: r.reason, detail: r.detail });
  }
  // EDUCATION / MULTI-CARD (printing_compare)
  {
    const r = await MD.resolvePrintingPair();
    if (r.ok) push({ series: "EXACT_PRINTING_MATTERS", layout: "printing_compare", category: "EDUCATION", cards: r.cards, dataOk: true, props: {
      species: r.data.species, high: r.data.high, low: r.data.low, multiple: r.data.multiple,
    }, species: r.data.species, numeric: [r.data.high.price_usd, r.data.low.price_usd, r.data.multiple], priceContrast: true, cardSpecific: true });
    else push({ series: "EXACT_PRINTING_MATTERS", layout: "printing_compare", category: "EDUCATION", withheld: r.reason, detail: r.detail });
  }
  // EDUCATION / PROCESS (bid_vs_total)
  {
    const r = await MD.resolveBidVsTotal();
    if (r.ok) push({ series: "AUCTION_BID_VS_TOTAL", layout: "bid_vs_total", category: "EDUCATION", cards: r.cards, dataOk: true, props: {
      card: { tcgplayerId: r.data.tcgplayerId, name: r.data.card_name, set: r.data.card_set }, bidUsd: r.data.bid_usd, shippingUsd: r.data.shipping_usd, landedUsd: r.data.landed_total_usd, marketRefUsd: r.data.market_ref_usd,
    }, species: r.data.card_name, numeric: [r.data.bid_usd, r.data.shipping_usd, r.data.landed_total_usd], priceContrast: true, cardSpecific: true });
    else push({ series: "AUCTION_BID_VS_TOTAL", layout: "bid_vs_total", category: "EDUCATION", withheld: r.reason, detail: r.detail });
  }
  // DEAL (deal_hero) - the quality FLOOR
  {
    const r = await MD.resolveAskingVsSold({ minDiscount: 0.45, minMarket: 30 });
    if (r.ok) push({ series: "DEAL_DROP", layout: "deal_hero", category: "DEAL", cards: r.cards, dataOk: true, props: {
      card: { tcgplayerId: r.data.tcgplayerId, name: r.data.card_name, set: r.data.card_set }, priceUsd: r.data.asking_usd, marketUsd: r.data.market_ref_usd, discountPct: r.data.gap_pct,
    }, species: r.data.card_name, numeric: [r.data.asking_usd, r.data.market_ref_usd, r.data.gap_pct], priceContrast: true, cardSpecific: true });
    else push({ series: "DEAL_DROP", layout: "deal_hero", category: "DEAL", withheld: r.reason, detail: r.detail });
  }
  // MULTI-CARD DEAL (three_up)
  {
    const r = await MD.resolveThreeUnder({ cap: 25, n: 3 });
    if (r.ok) push({ series: "THREE_UNDER_25", layout: "three_up", category: "DEAL", cards: r.cards, dataOk: true, props: {
      cap: r.data.cap, items: r.data.items,
    }, numeric: r.data.items.flatMap((i) => [i.price_usd, i.discount_pct]), primaryNumeric: r.data.items.map((i) => i.price_usd), priceContrast: true, cardSpecific: true });
    else push({ series: "THREE_UNDER_25", layout: "three_up", category: "DEAL", withheld: r.reason, detail: r.detail });
  }
  // MOVERS replacement - data-gated (SS11/SS22). Real confident moves via
  // the sanctioned price-movement confidence gate, or WITHHELD.
  {
    const r = await MD.resolveMovers({ topN: 3 });
    if (r.ok) push({ series: "BIGGEST_MOVERS", layout: "movers_countdown", category: "MARKET", cards: r.cards, dataOk: true, cardSpecific: true, priceContrast: true,
      props: { movers: r.data.movers, windowLabel: r.data.window_label },
      numeric: r.data.movers.flatMap((m) => [m.pct, m.from_usd, m.to_usd].filter((v) => v != null)),
      primaryNumeric: r.data.movers.map((m) => m.pct).filter((v) => v != null) });
    else push({ series: "BIGGEST_MOVERS", layout: "movers_countdown", category: "MARKET", withheld: r.reason, detail: r.detail });
  }
  return out;
}

(async () => {
  mkdirSync(RENDERS, { recursive: true });
  const families = await buildFamilies();
  const renderer = await createRenderer();
  const assets = [];
  try {
    for (const fam of families) {
      if (fam.withheld) { assets.push({ series: fam.series, layout: fam.layout, category: fam.category, verdict: "WITHHELD", reason: fam.withheld, detail: fam.detail }); continue; }
      const art = await resolveArt(fam.cards ?? []);
      const target = fam.category === "MARKET" || fam.category === "DEAL" ? "ig_45" : "ig_45";
      const html = renderCardEditorialHtml(fam.layout, { ...fam.props, target, cardArt: art.map });
      const p = path.join(RENDERS, `${fam.series.toLowerCase()}_${fam.layout}.png`);
      await renderer.renderToPng(html, p);
      const bytes = readFileSync(p);

      const cardIds = (fam.cards ?? []).map((c) => String(c.tcgplayerId));
      const heroFrac = fam.layout === "deal_hero" || fam.layout === "asking_vs_sold" || fam.layout === "bid_vs_total" ? 0.42 : fam.layout === "printing_compare" || fam.layout === "three_up" || fam.layout === "movers_countdown" ? 0.4 : fam.layout === "market_shape" ? 0.34 : 0.2;
      const ca = collectibleAppeal({
        layout_family: fam.layout,
        card_ids_shown: fam.cardSpecific ? cardIds : (fam.cards ?? []).map((c) => String(c.tcgplayerId)),
        card_art_ready_ids: art.readyIds,
        numeric_callouts: fam.numeric ?? [],
        has_price_contrast: Boolean(fam.priceContrast),
        hero_fraction: heroFrac,
        is_generic_typographic: false,
        species: fam.species ?? null,
        recognizable_subject: undefined,
      });
      const t = CARD_TARGETS[target];
      const eqa = editorialCreativeQa({
        editorial: true, layout_family: fam.layout, target: "ig_45",
        hookText: fam.series.replace(/_/g, " "), hookPx: 60, ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 22,
        statCallouts: ((fam.primaryNumeric ?? fam.numeric) ?? []).map(String), bodyChars: 120,
        safe: { top: t.pad, right: t.pad, bottom: t.pad, left: t.pad },
      });
      const l5 = reviewAvailable()
        ? await reviewRenderedCreativeMulti(p, { platform: "instagram", family: fam.layout, series: fam.series, cardForward: CARD_SPECIFIC_FAMILIES.includes(fam.layout), editorial: true, ctaIntensity: fam.category === "DEAL" ? "SOFT" : "BRAND_ONLY" }, { samples: SAMPLES })
        : { available: false, verdict: "WATCH", verdicts: [], scores: null, notes: ["no OpenAI key"], consistent: false };

      const overall = [eqa.grade, ca.grade, l5.verdict].includes("FAIL") ? "FAIL"
        : [eqa.grade, ca.grade, l5.verdict].includes("WATCH") ? "WATCH" : "PASS";

      const cls = CARD_LAYOUT_STATUS[fam.series] ?? null;
      const sc = l5.scores ?? {};
      // §29 per-asset scorecard - Layer-5 rubric dims mapped to the phase's names
      const scorecard = l5.scores ? {
        SCROLL_STOP: sc.SCROLL_STOP_STRENGTH ?? null,
        CARD_PROMINENCE: sc.CARD_ART_USAGE ?? null,
        DATA_IMPACT: sc.DATA_VISUAL_IMPACT ?? null,
        COLLECTIBLE_APPEAL: sc.COLLECTIBLE_VISUAL_APPEAL ?? null,
        HOBBY_NATIVE_FEEL: sc.HOBBY_NATIVE_FEEL ?? null,
        ORGANIC_VALUE: sc.VISUAL_SPECIFICITY ?? sc.EMOTIONAL_COLLECTOR_RELEVANCE ?? null,
        PREMIUM_FEEL: sc.PREMIUM_FEEL ?? null,
        THUMBNAIL_READABILITY: sc.THUMBNAIL_STORY_CLARITY ?? null,
        AI_SPAM_RISK: sc.AI_SPAM_RISK ?? null,
        CONVERSION_FIT: sc.CTA_CLARITY ?? null,
        overall,
        verdict: overall,
      } : null;
      assets.push({
        series: fam.series, layout: fam.layout, category: fam.category,
        render: path.relative(ROOT, p), artifact_sha256: sha256(bytes).slice(0, 16), bytes: bytes.length,
        card_ids: cardIds, card_art_ready: art.readyIds.length, card_art_wanted: cardIds.length,
        real_numbers: (fam.numeric ?? []).map(String),
        classification: cls ? cls.grade : null,
        autonomous_safe: Boolean(cls?.autonomous_safe),
        deterministic_editorial_qa: eqa.grade,
        collectible_appeal: { grade: ca.grade, failed: ca.failed },
        layer5: { verdict: l5.verdict, consistent: l5.consistent, verdicts: l5.verdicts, scores: l5.scores, notes: (l5.notes ?? []).slice(0, 4) },
        scorecard,
        overall,
      });
      log(`  ${fam.series.padEnd(24)} ${fam.layout.padEnd(18)} art ${art.readyIds.length}/${cardIds.length}  eQA=${eqa.grade} CA=${ca.grade} L5=${l5.verdict}[${(l5.verdicts || []).join("/")}] -> ${overall}`);
    }
  } finally {
    await renderer.close();
  }

  const rendered = assets.filter((a) => a.render);
  const fu = (rel) => pathToFileURL(path.resolve(ROOT, rel)).href;

  // --- next-9 feed grid: repeat the rendered set to a realistic 3x3 IG
  //     profile grid so diversity / "corporate infographic account" is
  //     judgeable (SS27).
  const grid9 = Array.from({ length: 9 }, (_, i) => rendered[i % rendered.length]);
  const gridCells = grid9.map((a) => `<div style="position:relative;aspect-ratio:4/5;overflow:hidden;background:#111"><img src="${fu(a.render)}" style="width:100%;display:block"><span style="position:absolute;left:6px;bottom:6px;background:#000a;color:#fff;font:11px sans-serif;padding:2px 6px;border-radius:4px">${a.series} · ${a.overall}</span></div>`).join("");
  writeFileSync(path.join(OUT, "feed-grid.html"), `<!doctype html><meta charset="utf-8"><body style="background:#0b0b0d;margin:0;padding:24px;font-family:sans-serif"><div style="max-width:1080px;margin:auto"><p style="color:#888;font-size:13px">Simulated @pokemondealfinder profile grid — does this read as a hobby account or a corporate infographic feed?</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">${gridCells}</div></div></body>`);

  // --- previews: thumbnail (150px) / 25% / mobile-feed frame (SS13/SS26)
  const previewRows = rendered.map((a) => `
    <div style="display:flex;gap:28px;align-items:flex-start;padding:24px 0;border-bottom:1px solid #222">
      <div style="flex:0 0 auto">
        <div style="color:#fff;font:600 14px sans-serif">${a.series}</div>
        <div style="color:#888;font:12px sans-serif;margin:2px 0 10px">${a.layout} · ${a.classification ?? "—"} · <b style="color:${a.overall === "PASS" ? "#3FCF8E" : a.overall === "FAIL" ? "#F0322E" : "#E5B800"}">${a.overall}</b></div>
        <div style="display:flex;gap:16px;align-items:flex-start">
          <figure style="margin:0"><img src="${fu(a.render)}" style="width:120px;display:block;border-radius:6px"><figcaption style="color:#666;font:11px sans-serif;text-align:center;margin-top:4px">thumb 120px</figcaption></figure>
          <figure style="margin:0"><img src="${fu(a.render)}" style="width:270px;display:block;border-radius:6px"><figcaption style="color:#666;font:11px sans-serif;text-align:center;margin-top:4px">25% (270px)</figcaption></figure>
          <figure style="margin:0"><div style="width:320px;border:10px solid #1c1c1f;border-radius:28px;overflow:hidden"><div style="background:#000;color:#fff;font:11px sans-serif;padding:6px 10px">pokemondealfinder</div><img src="${fu(a.render)}" style="width:100%;display:block"><div style="background:#000;color:#888;font:11px sans-serif;padding:8px 10px">♡ ⤴ &nbsp; View on eBay →</div></div><figcaption style="color:#666;font:11px sans-serif;text-align:center;margin-top:4px">mobile feed</figcaption></figure>
        </div>
      </div>
    </div>`).join("");
  writeFileSync(path.join(OUT, "previews.html"), `<!doctype html><meta charset="utf-8"><body style="background:#0b0b0d;margin:0;padding:32px"><h1 style="color:#fff;font:700 18px sans-serif">SOCIAL-CREATIVE-3 — thumbnail / 25% / mobile previews</h1>${previewRows}</body>`);

  const summary = {
    generated_at: new Date().toISOString(),
    layer5_configured: reviewAvailable(), samples: SAMPLES,
    families_built: families.length,
    assets,
    withheld: assets.filter((a) => a.verdict === "WITHHELD").map((a) => ({ series: a.series, reason: a.reason, detail: a.detail })),
    pass: assets.filter((a) => a.overall === "PASS").map((a) => `${a.series}/${a.layout}`),
    watch: assets.filter((a) => a.overall === "WATCH").map((a) => `${a.series}/${a.layout}`),
    fail: assets.filter((a) => a.overall === "FAIL").map((a) => `${a.series}/${a.layout}`),
    classification: {
      VISUALLY_STRONG_NOW: assets.filter((a) => a.classification === "VISUALLY_STRONG_NOW").map((a) => a.series),
      VISUALLY_STRONG_WITH_REDESIGN: assets.filter((a) => a.classification === "VISUALLY_STRONG_WITH_REDESIGN").map((a) => a.series),
      DATA_NOT_READY: assets.filter((a) => (a.classification ?? (a.verdict === "WITHHELD" ? "DATA_NOT_READY" : null)) === "DATA_NOT_READY").map((a) => a.series),
      autonomous_safe_layouts: AUTONOMOUS_SAFE_CARD_LAYOUTS,
      manual_only_layouts: MANUAL_ONLY_CARD_LAYOUTS,
    },
    feed_grid: path.relative(ROOT, path.join(OUT, "feed-grid.html")),
    previews: path.relative(ROOT, path.join(OUT, "previews.html")),
    safety: { published: 0, scheduled: 0, buffer_calls: 0, hosted: 0, ebay_browse: 0, stage1: "OFF", newsroom3: "OFF" },
  };
  writeFileSync(path.join(OUT, "creative-pack.json"), JSON.stringify(summary, null, 2) + "\n");
  if (JSON_OUT) console.log(JSON.stringify(summary, null, 2));
  else {
    log(`\nPASS: ${summary.pass.join(", ") || "-"}`);
    log(`WATCH: ${summary.watch.join(", ") || "-"}`);
    log(`FAIL: ${summary.fail.join(", ") || "-"}`);
    log(`WITHHELD: ${summary.withheld.map((w) => w.series).join(", ") || "-"}`);
    log(`pack: ${path.relative(ROOT, OUT)}/`);
  }
})().catch((e) => { console.error("social:creative-pack failed:", e?.stack || e?.message || e); process.exit(1); });
