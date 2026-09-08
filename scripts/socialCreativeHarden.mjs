#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-3B - `npm run social:creative-harden`
//
// The representative reliability test for deal_hero and bid_vs_total
// (SS13-SS15). For each family it resolves >=8 REAL, varied samples,
// renders each, runs the deterministic gates (editorialCreativeQa +
// collectibleAppeal + the SS17 family-specific checks) and the 5-sample
// worst-case Layer-5 review, and reports the PASS rate.
//
// A family qualifies as autonomous-safe only at >=90% Layer-5 PASS across
// the samples with no FAIL and no recurring deterministic blocker.
//
// NOTHING is published, scheduled, hosted, or written to Buffer. No eBay
// Browse. No verify change. No Stage 1. No NEWSROOM-3.
//
//   node scripts/socialCreativeHarden.mjs [--json] [--samples N] [--per-family K]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { createRenderer } from "../lib/social/render.mjs";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { resolveCardArtwork } from "../lib/social/cardArtwork.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { sha256 } from "../lib/social/storage/hostedAssets.mjs";

import { renderCardEditorialHtml, CARD_TARGETS } from "../lib/social/newsroom/cardEditorialTemplates.mjs";
import { collectibleAppeal } from "../lib/social/newsroom/collectibleAppeal.mjs";
import { editorialCreativeQa } from "../lib/social/newsroom/editorialQa.mjs";
import {
  dealHeroChecks, bidVsTotalChecks, dealHeroWithholdReason,
  DEAL_HERO_LAYOUT, BID_VS_TOTAL_LAYOUT,
} from "../lib/social/newsroom/cardCreativeChecks.mjs";
import * as MD from "../lib/social/newsroom/marketData.mjs";
import { feedReview } from "../lib/social/newsroom/feedReview.mjs";
import { LAYOUT_CTA_ZONE } from "../lib/social/newsroom/renderRegistry.mjs";
import { CARD_LAYOUT_CTA_ZONE } from "../lib/social/newsroom/cardLayoutStatus.mjs";
import { reviewRenderedCreativeMulti, reviewAvailable } from "../lib/newsroom/visualReview.mjs";

// SS19 - a next-12 simulated feed mixing every card-forward family + one
// editorial family. Uses the real feedReview ceilings.
function simulatedFeed12() {
  const spec = [
    ["market_shape", "MARKET_SNAPSHOT", "MARKET"],
    ["asking_vs_sold", "WHY_SOLD_PRICES_MATTER", "EDUCATION"],
    ["deal_hero", "DEAL_DROP", "DEALS"],
    ["printing_compare", "EXACT_PRINTING_MATTERS", "COMPARISON"],
    ["bid_vs_total", "AUCTION_BID_VS_TOTAL", "EDUCATION"],
    ["process_explainer", "HOW_WE_FIND_DEALS", "BEHIND_THE_FINDER"],
    ["three_up", "THREE_UNDER_25", "BUDGET"],
    ["market_shape", "MARKET_SNAPSHOT", "MARKET"],
    ["asking_vs_sold", "WHY_SOLD_PRICES_MATTER", "EDUCATION"],
    ["deal_hero", "DEAL_DROP", "DEALS"],
    ["printing_compare", "EXACT_PRINTING_MATTERS", "COMPARISON"],
    ["trust_editorial", "METHODOLOGY", "BRAND"],
  ];
  return spec.map(([lf, series, pillar], i) => ({
    story: { series, pillar, bucket: pillar === "DEALS" || pillar === "BUDGET" ? "CONVERSION" : "AUTHORITY", facts_json: {} },
    signature: {
      layout_family: lf,
      cta_zone: CARD_LAYOUT_CTA_ZONE[lf] ?? LAYOUT_CTA_ZONE[lf] ?? "bottom",
      hook_grammar: `${lf}:${i % 3}`,
      loud_brand: false,
      red_accent: false,
    },
  }));
}

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const SAMPLES = Number((args[args.indexOf("--samples") + 1] ?? "").match(/^\d+$/)?.[0] || 5);
const PER_FAMILY = Number((args[args.indexOf("--per-family") + 1] ?? "").match(/^\d+$/)?.[0] || 8);
const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "creative-3b");
const RENDERS = path.join(OUT, "renders");
const log = (...a) => { if (!JSON_OUT) console.log(...a); };

async function artFor(cards) {
  const db = supabaseAdmin();
  const ids = [...new Set(cards.map((c) => String(c.tcgplayerId)))].filter((id) => /^\d+$/.test(id));
  const { data: cat } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,image_url").in("tcgplayer_id", ids);
  const byId = Object.fromEntries((cat ?? []).map((r) => [String(r.tcgplayer_id).trim(), r]));
  const map = {};
  const ready = [];
  for (const id of ids) {
    const row = byId[id];
    const r = await resolveCardArtwork(
      { card_tcgplayer_id: id, card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null },
      { rightsState: RIGHTS_STATE, catalogRow: row ?? null }
    );
    if (r.status === "ready") { map[id] = pathToFileURL(path.resolve(r.localPath)).href; ready.push(id); }
  }
  return { map, readyIds: ready };
}

function summarise(verdicts) {
  const pass = verdicts.filter((v) => v === "PASS").length;
  const watch = verdicts.filter((v) => v === "WATCH").length;
  const fail = verdicts.filter((v) => v === "FAIL").length;
  return { pass, watch, fail, worst: fail ? "FAIL" : watch ? "WATCH" : "PASS" };
}

(async () => {
  mkdirSync(RENDERS, { recursive: true });
  if (!reviewAvailable()) { console.error("social:creative-harden: OPENAI_API_KEY not set - cannot run the reliability test"); process.exit(1); }

  const dh = await MD.resolveDealHeroSamples({ n: PER_FAMILY });
  const bv = await MD.resolveBidVsTotalSamples({ n: PER_FAMILY });

  const renderer = await createRenderer();
  const families = {};
  try {
    for (const fam of [
      { key: "deal_hero", series: "DEAL_DROP", res: dh, layout: DEAL_HERO_LAYOUT,
        build: (it) => ({ card: { tcgplayerId: it.tcgplayerId, name: it.card_name, set: it.card_set }, priceUsd: it.price_usd, marketUsd: it.market_ref_usd, discountPct: it.gap_pct }),
        det: (it) => dealHeroChecks({ price_usd: it.price_usd, market_usd: it.market_ref_usd, saved_pct: it.gap_pct, ...DEAL_HERO_LAYOUT }),
        numeric: (it) => [it.price_usd, it.market_ref_usd, it.gap_pct] },
      { key: "bid_vs_total", series: "AUCTION_BID_VS_TOTAL", res: bv, layout: BID_VS_TOTAL_LAYOUT,
        build: (it) => ({ card: { tcgplayerId: it.tcgplayerId, name: it.card_name, set: it.card_set }, bidUsd: it.bid_usd, shippingUsd: it.shipping_usd, landedUsd: it.landed_total_usd, marketRefUsd: it.market_ref_usd }),
        det: (it) => bidVsTotalChecks({ bid_usd: it.bid_usd, shipping_usd: it.shipping_usd, landed_usd: it.landed_total_usd, market_ref_usd: it.market_ref_usd, currency: it.currency, ...BID_VS_TOTAL_LAYOUT }),
        numeric: (it) => [it.bid_usd, it.shipping_usd, it.landed_total_usd] },
    ]) {
      if (!fam.res.ok) { families[fam.key] = { withheld: fam.res.reason, detail: fam.res.detail, assets: [] }; log(`\n### ${fam.key}: WITHHELD - ${fam.res.detail}`); continue; }
      const allItems = fam.res.data.items;
      // SS8 - the autonomous picker only renders deal_hero for a deal with
      // real commercial pull; withheld samples are reported but excluded
      // from the autonomous reliability figure.
      const withheldRows = [];
      const items = allItems.filter((it) => {
        if (fam.key !== "deal_hero") return true;
        const r = dealHeroWithholdReason({ price_usd: it.price_usd, market_usd: it.market_ref_usd, saved_pct: it.gap_pct, species: it.card_name, card_name: it.card_name });
        if (r) { withheldRows.push({ card: `${it.card_name} - ${it.card_set}`, reason: r }); return false; }
        return true;
      });
      log(`\n### ${fam.key}  (${items.length} autonomous-eligible real samples x ${SAMPLES} Layer-5${withheldRows.length ? `, ${withheldRows.length} withheld by the SS8 pull gate` : ""})`);
      for (const w of withheldRows) log(`  [withheld] ${w.card} - ${w.reason}`);
      const assets = [];
      for (const it of items) {
        const art = await artFor([{ tcgplayerId: it.tcgplayerId }]);
        const html = renderCardEditorialHtml(fam.key, { ...fam.build(it), target: "ig_45", cardArt: art.map });
        const p = path.join(RENDERS, `${fam.key}_${it.tcgplayerId}.png`);
        await renderer.renderToPng(html, p);
        const bytes = readFileSync(p);

        const det = fam.det(it);
        const ca = collectibleAppeal({
          layout_family: fam.key,
          card_ids_shown: [String(it.tcgplayerId)],
          card_art_ready_ids: art.readyIds,
          numeric_callouts: fam.numeric(it),
          has_price_contrast: true,
          hero_fraction: fam.layout.hero_fraction,
          is_generic_typographic: false,
          species: it.card_name,
        });
        const t = CARD_TARGETS.ig_45;
        const eqa = editorialCreativeQa({
          editorial: true, layout_family: fam.key, target: "ig_45",
          hookText: fam.key === "bid_vs_total" ? "The bid isn't the price." : it.card_name,
          ctaCount: 1, wordmarkCount: 1, minInlineFontPx: 22,
          statCallouts: fam.numeric(it).map(String), bodyChars: 90,
          safe: { top: t.pad, right: t.pad, bottom: t.pad, left: t.pad },
        });
        const l5 = await reviewRenderedCreativeMulti(
          p,
          { platform: "instagram", family: fam.key, series: fam.series, cardForward: true, editorial: true, ctaIntensity: fam.key === "deal_hero" ? "SOFT" : "BRAND_ONLY" },
          { samples: SAMPLES }
        );
        const overall = [eqa.grade, ca.grade, det.grade, l5.verdict].includes("FAIL") ? "FAIL"
          : [eqa.grade, ca.grade, det.grade, l5.verdict].includes("WATCH") ? "WATCH" : "PASS";
        const row = {
          tcgplayerId: it.tcgplayerId, card: `${it.card_name} - ${it.card_set}`,
          real_numbers: fam.numeric(it),
          det: { grade: det.grade, failed: det.failed },
          eqa: eqa.grade, ca: { grade: ca.grade, failed: ca.failed },
          layer5: { verdict: l5.verdict, verdicts: l5.verdicts, scores: l5.scores, notes: (l5.notes ?? []).slice(0, 3) },
          overall, render: path.relative(ROOT, p), sha: sha256(bytes).slice(0, 12),
        };
        assets.push(row);
        log(`  ${String(it.card_name).slice(0, 26).padEnd(26)} det=${det.grade.padEnd(5)} eQA=${eqa.grade.padEnd(5)} CA=${ca.grade.padEnd(5)} L5=${l5.verdict}[${l5.verdicts.join("/")}] -> ${overall}${det.failed.length ? "  det:" + det.failed.join(",") : ""}`);
      }
      const l5v = assets.map((a) => a.layer5.verdict);
      const l5s = summarise(l5v);
      const overalls = assets.map((a) => a.overall);
      const os = summarise(overalls);
      const passRate = assets.length ? l5s.pass / assets.length : 0;
      // recurring deterministic blocker = same det-check id failing on >=2 samples
      const detFails = {};
      for (const a of assets) for (const f of a.det.failed) detFails[f] = (detFails[f] ?? 0) + 1;
      const recurring = Object.entries(detFails).filter(([, n]) => n >= 2).map(([k, n]) => `${k}x${n}`);
      const qualifies =
        assets.length >= 6 &&
        l5s.fail === 0 && os.fail === 0 &&
        passRate >= 0.9 &&
        recurring.length === 0;
      families[fam.key] = {
        samples: assets.length, withheld_by_pull_gate: withheldRows,
        layer5: l5s, overall: os, layer5_pass_rate: Math.round(passRate * 100) / 100,
        recurring_det_blockers: recurring, qualifies_autonomous_safe: qualifies, assets,
      };
      log(`  => Layer-5 ${l5s.pass}/${assets.length} PASS (${Math.round(passRate * 100)}%), ${l5s.watch} WATCH, ${l5s.fail} FAIL | overall ${os.pass}P/${os.watch}W/${os.fail}F | recurring det: ${recurring.join(",") || "none"} | AUTONOMOUS-SAFE: ${qualifies ? "YES" : "NO"}`);
    }
  } finally {
    await renderer.close();
  }

  // feed grid of the two candidates + their renders
  const cells = [];
  for (const k of Object.keys(families)) for (const a of (families[k].assets ?? [])) {
    cells.push(`<div style="position:relative"><img src="${pathToFileURL(path.resolve(ROOT, a.render)).href}" style="width:100%;display:block;border-radius:6px"><span style="position:absolute;left:5px;bottom:5px;background:#000a;color:#fff;font:10px sans-serif;padding:2px 5px;border-radius:3px">${k} ${a.overall}</span></div>`);
  }
  writeFileSync(path.join(OUT, "harden-grid.html"), `<!doctype html><meta charset=utf-8><body style="background:#0b0b0d;margin:0;padding:20px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:1200px;margin:auto">${cells.join("")}</div></body>`);

  const feed = feedReview(simulatedFeed12());
  log(`\n### FEED-12  -> ${feed.verdict}${feed.warnings?.length ? "  warnings: " + feed.warnings.join("; ") : ""}${feed.blockers?.length ? "  BLOCKERS: " + feed.blockers.join("; ") : ""}`);

  const summary = {
    generated_at: new Date().toISOString(), samples: SAMPLES, per_family: PER_FAMILY,
    feed_12: feed,
    families,
    verdict: {
      deal_hero: families.deal_hero?.qualifies_autonomous_safe ? "AUTONOMOUS_SAFE" : "MANUAL_ONLY",
      bid_vs_total: families.bid_vs_total?.qualifies_autonomous_safe ? "AUTONOMOUS_SAFE" : "MANUAL_ONLY",
    },
    safety: { published: 0, scheduled: 0, buffer_calls: 0, hosted: 0, ebay_browse: 0, stage1: "OFF", newsroom3: "OFF" },
  };
  writeFileSync(path.join(OUT, "harden.json"), JSON.stringify(summary, null, 2) + "\n");
  if (JSON_OUT) console.log(JSON.stringify(summary, null, 2));
  else {
    log(`\nVERDICT: deal_hero=${summary.verdict.deal_hero}  bid_vs_total=${summary.verdict.bid_vs_total}`);
    log(`pack: ${path.relative(ROOT, OUT)}/`);
  }
})().catch((e) => { console.error("social:creative-harden failed:", e?.stack || e?.message || e); process.exit(1); });
