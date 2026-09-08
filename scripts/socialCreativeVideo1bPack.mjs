#!/usr/bin/env node
// Phase SOCIAL-CREATIVE-4C.1 (§18, §19, §20) - GENERATIVE VIDEO ART
// DIRECTION proof pack. OLD 4C (sparse template) vs NEW 4C.1 (OpenAI
// designs each scene board; code animates between them).
//
//   node scripts/socialCreativeVideo1bPack.mjs                  OLD plan only, no OpenAI, no render
//   node scripts/socialCreativeVideo1bPack.mjs --ai --render     generate boards + render OLD and NEW MP4s
//   ... --concepts 1        cheaper (1 board concept instead of 2)
//   ... --only DEAL_DROP     one family
//
// Read-only DB. NOTHING published - no TikTok / YouTube upload, no Buffer,
// no cron, no RIGHTS change, no email, no eBay Browse.

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const ROOT = process.cwd();
const OUT = path.join(ROOT, ".social-preview", "video-1b-generative");
const args = process.argv.slice(2);
const AI = args.includes("--ai");
const RENDER = args.includes("--render");
const CONCEPTS = args.includes("--concepts") ? Number(args[args.indexOf("--concepts") + 1]) || 2 : 2;
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const REUSE = args.includes("--reuse"); // reuse boards already on disk, skip (re)generation

const { supabaseAdmin } = await import("../lib/supabaseAdmin.js");
const { buildFactLock } = await import("../lib/newsroom/editorial/factLock.mjs");
const { contractFor } = await import("../lib/newsroom/editorial/storyContracts.mjs");
const { buildSemanticManifest } = await import("../lib/newsroom/hybrid/semanticManifest.mjs");
const { newBudget, costReport, totalCostUsd } = await import("../lib/newsroom/hybrid/budget.mjs");
const V = await import("../lib/newsroom/video/index.mjs");
const MD = await import("../lib/social/newsroom/marketData.mjs");
const { resolveCardArtwork } = await import("../lib/social/cardArtwork.mjs");
const { RIGHTS_STATE } = await import("../lib/social/rights.mjs");

const db = supabaseAdmin();
if (!REUSE) rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "media"), { recursive: true });
mkdirSync(path.join(OUT, "boards"), { recursive: true });
const readdir = (p) => (existsSync(p) ? readdirSync(p) : []);

console.log(`=== SOCIAL-CREATIVE-4C.1 generative video art direction proof ===`);
console.log(`ai: ${AI ? "ON" : "OFF"}   render: ${RENDER ? "ON" : "OFF"}   concepts: ${CONCEPTS}\n`);

async function catalogRow(id) {
  if (!/^\d+$/.test(String(id ?? ""))) return null;
  const { data } = await db.from("card_catalog").select("tcgplayer_id,name,set,card_number,rarity,language,image_url").eq("tcgplayer_id", String(id)).maybeSingle();
  return data ?? null;
}
async function artPath(id, row) {
  const r = await resolveCardArtwork({ card_tcgplayer_id: String(id), card_name: row?.name ?? null, card_set: row?.set ?? null, card_number: row?.card_number ?? null }, { rightsState: RIGHTS_STATE, catalogRow: row ?? null }).catch(() => ({ status: "unavailable" }));
  return r.status === "ready" ? path.resolve(r.localPath) : null;
}
function factTraceFrom(sem) {
  const rows = [];
  for (const k of sem.card_metadata_lock?._displayable ?? []) rows.push({ visible_claim: `${k}: ${sem.card_metadata_lock[k]}`, expected_value: sem.card_metadata_lock[k], source_type: "CARD_CATALOG", verdict: "PASS" });
  for (const t of sem.required_text ?? []) rows.push({ visible_claim: t, expected_value: t, source_type: /^\$|%/.test(t) ? "DERIVED_CALCULATION" : "EDITORIAL_LABEL", verdict: "PASS" });
  for (const p of sem.visualization_data_manifest?.allowed_points ?? []) rows.push({ visible_claim: `chart ${p.label}`, expected_value: `${p.value}%`, source_type: "DERIVED_CALCULATION", verdict: "PASS" });
  return rows;
}

// ---- gather the four required real stories -------------
const wanted = ["DEAL_DROP", "MARKET_SNAPSHOT", "ASKING_VS_SOLD", "THREE_UNDER_25"].filter((w) => !ONLY || w === ONLY);
const dRes = await MD.resolveDealHeroSamples({ n: 2 }).catch((e) => ({ ok: false, reason: e.message }));
const mRes = await MD.resolveMarketShape().catch((e) => ({ ok: false, reason: e.message }));
const aRes = await MD.resolveAskingVsSold().catch((e) => ({ ok: false, reason: e.message }));
const tRes = await MD.resolveThreeUnder().catch((e) => ({ ok: false, reason: e.message }));

const stories = [];
if (wanted.includes("DEAL_DROP") && dRes?.ok && dRes.data.items?.[0]) {
  const it = dRes.data.items[0];
  const listed = Number(it.price_usd), market = Number(it.market_ref_usd), pct = it.gap_pct ?? Math.round((1 - listed / market) * 100);
  stories.push({ id: "DEAL_DROP", family: "deal_hero", series: "DEAL_DROP",
    resolved: { ok: true, data: { card: { name: it.card_name, set: it.card_set, tcgplayerId: it.tcgplayerId }, card_name: it.card_name, card_set: it.card_set, priceUsd: listed, marketUsd: market, discountPct: pct } },
    facts: { card_name: it.card_name, card_set: it.card_set, card_tcgplayer_id: it.tcgplayerId, listed_price: listed, market_price: market, discount_pct: pct }, heroId: it.tcgplayerId });
} else if (wanted.includes("DEAL_DROP")) stories.push({ id: "DEAL_DROP", status: `WITHHELD: ${dRes?.reason ?? "no BIN sample"}` });

if (wanted.includes("MARKET_SNAPSHOT") && mRes?.ok) {
  stories.push({ id: "MARKET_SNAPSHOT", family: "market_shape", series: "MARKET_SNAPSHOT", resolved: mRes,
    facts: { tracked_count: mRes.data.priced_cards, percentages: [mRes.data.under_25_pct, mRes.data.over_100_pct], card_name: mRes.data.featured?.card_name }, heroId: mRes.data.featured?.tcgplayerId });
} else if (wanted.includes("MARKET_SNAPSHOT")) stories.push({ id: "MARKET_SNAPSHOT", status: `WITHHELD: ${mRes?.reason ?? "no data"}` });

if (wanted.includes("ASKING_VS_SOLD") && aRes?.ok) {
  stories.push({ id: "ASKING_VS_SOLD", family: "asking_vs_sold", series: "WHY_SOLD_PRICES_MATTER", resolved: aRes,
    facts: { card_name: aRes.data.card_name, card_set: aRes.data.card_set, card_tcgplayer_id: aRes.data.tcgplayerId, listed_price: aRes.data.asking_usd, market_price: aRes.data.market_ref_usd }, heroId: aRes.data.tcgplayerId });
} else if (wanted.includes("ASKING_VS_SOLD")) stories.push({ id: "ASKING_VS_SOLD", status: `WITHHELD: ${aRes?.reason ?? "no data"}` });

if (wanted.includes("THREE_UNDER_25") && tRes?.ok) {
  stories.push({ id: "THREE_UNDER_25", family: "three_up", series: "THREE_UNDER_25", resolved: tRes, facts: { percentages: [] }, heroId: tRes.data.items?.[0]?.tcgplayerId, items: tRes.data.items });
} else if (wanted.includes("THREE_UNDER_25")) stories.push({ id: "THREE_UNDER_25", status: `WITHHELD: ${tRes?.reason ?? "no inventory"}` });

// ---- run OLD + NEW per story --------------------------
const budgets = [];
const results = {};
for (const s of stories) {
  if (s.status) { console.log(`${s.id}: ${s.status}`); results[s.id] = { status: s.status }; continue; }
  const { id, family, series, resolved } = s;
  const d = resolved.data;
  const catRow = await catalogRow(s.heroId);
  const factLock = buildFactLock({ facts_json: s.facts ?? d });
  const contract = contractFor(series);
  const sem = buildSemanticManifest({ layout: family, factLock, resolved, contract, cardCatalogRow: catRow });
  const factTrace = factTraceFrom(sem);
  const cardPaths = family === "three_up"
    ? (await Promise.all((d.items ?? []).slice(0, 3).map(async (it) => artPath(it.tcgplayerId, await catalogRow(it.tcgplayerId))))).filter(Boolean)
    : family === "market_shape"
      ? (s.heroId ? [await artPath(s.heroId, catRow)].filter(Boolean) : [])
      : (s.heroId ? [await artPath(s.heroId, catRow)].filter(Boolean) : []);
  const ch = { story_id: id, semantic_hash: `cap-${id}`, image_artifact_id: `img-${id}`, cta: contract?.classification === "COMMERCIAL" ? "See the live deal" : "pokemondealfinder.com" };

  // OLD 4C
  const oldR = V.runVideoDirector({ story: { story_id: id }, semanticManifest: sem, factTrace, captionHandoff: ch, cardImagePaths: cardPaths, family });
  writeFileSync(path.join(OUT, `${id}_OLD_plan.json`), JSON.stringify(oldR.plan, null, 2));

  const rec = { id, family, old: { status: oldR.state, pacing: oldR.craft?.pacing?.verdict, motion: oldR.craft?.quality?.verdict } };

  if (AI) {
    const b = newBudget(); b.limits.background_generations = 40; b.limits.visual_review_calls = 400; budgets.push(b);
    const t0 = Date.now();
    // reuse boards already on disk (skip regeneration) when --reuse
    const cachedBoards = readdir(path.join(OUT, "boards")).filter((f) => f.startsWith(`${id}_board`) && !/FAILED/.test(f)).sort();
    let gen;
    if (REUSE && cachedBoards.length && existsSync(path.join(OUT, `${id}_NEW_boards.json`)) && existsSync(path.join(OUT, `${id}_NEW_motion.json`))) {
      const meta = JSON.parse(readFileSync(path.join(OUT, `${id}_NEW_boards.json`), "utf8"));
      const motion = JSON.parse(readFileSync(path.join(OUT, `${id}_NEW_motion.json`), "utf8"));
      const audits = existsSync(path.join(OUT, `${id}_NEW_audits.json`)) ? JSON.parse(readFileSync(path.join(OUT, `${id}_NEW_audits.json`), "utf8")) : {};
      const board_images = cachedBoards.map((f) => { const m = f.match(/_board(\d+)_(.+)\.png$/); return { index: Number(m[1]), role: m[2], b64: readFileSync(path.join(OUT, "boards", f)).toString("base64") }; });
      gen = { ok: true, state: "GENERATIVE_VIDEO_PLAN_READY (reused boards)", plan: oldR.plan, board_scenes: V.boardScenesFrom(oldR.plan), boards: meta, board_images, concept: meta[0]?.concept ?? "reused", motion_plan: motion, poster_board_index: audits.poster_board ?? 1, caption_link: { semantic_hash: ch.semantic_hash }, blockers: audits.blockers ?? [] };
      console.log(`  ${id}: reusing ${cachedBoards.length} cached boards`);
    } else {
      gen = await V.runGenerativeVideoDirector({ story: { story_id: id }, semanticManifest: sem, factLock: factLock, resolved, contract, factTrace, captionHandoff: ch, cardImagePaths: cardPaths, family, concepts: CONCEPTS, budget: b, env: process.env }).catch((e) => ({ ok: false, state: "ERR", reason: e.message }));
    }
    rec.new = { status: gen.state, ms: Date.now() - t0, concept: gen.concept ?? null, boards: gen.boards?.length ?? 0, cost_usd: totalCostUsd(b) };
    if (gen.ok) {
      gen.board_images.forEach((bi) => writeFileSync(path.join(OUT, "boards", `${id}_board${bi.index}_${bi.role}.png`), Buffer.from(bi.b64, "base64")));
      writeFileSync(path.join(OUT, `${id}_NEW_boards.json`), JSON.stringify(gen.boards.map((bd) => ({ index: bd.index, role: bd.role, model: bd.model, regenerated: bd.regenerated, verify: bd.verify, prompt: bd.prompt })), null, 2));
      writeFileSync(path.join(OUT, `${id}_NEW_motion.json`), JSON.stringify(gen.motion_plan, null, 2));
      writeFileSync(path.join(OUT, `${id}_NEW_audits.json`), JSON.stringify({ board_verify: gen.boards.map((bd) => ({ role: bd.role, ...bd.verify.audits, creative_scores: bd.verify.creative_scores })), plan_fact_semantic: V.auditVideo({ plan: gen.plan, semanticManifest: sem, factTrace }), plan_craft: V.auditVideoCraft({ plan: gen.plan }), blockers: gen.blockers }, null, 2));
      rec.new.board_roles = gen.boards.map((bd) => bd.role);
      rec.new.poster_board = gen.poster_board_index;

      if (RENDER) {
        // OLD MP4
        const oldMp4 = path.join(OUT, "media", `${id}_OLD.mp4`);
        const oldPoster = path.join(OUT, "media", `${id}_OLD.poster.png`);
        const or = await V.renderVideoPlanToMp4(oldR.plan, oldMp4, { posterPath: oldPoster }).catch((e) => ({ ok: false, reason: e.message }));
        rec.old.render = or.ok ? { size_kb: Math.round(statSync(oldMp4).size / 1024), ms: or.durationMs } : { fail: or.reason };
        // NEW MP4
        const newMp4 = path.join(OUT, "media", `${id}_NEW.mp4`);
        const newPoster = path.join(OUT, "media", `${id}_NEW.poster.png`);
        const nr = await V.renderGenerativeVideoToMp4(gen, newMp4, { posterPath: newPoster }).catch((e) => ({ ok: false, reason: e.message }));
        rec.new.render = nr.ok ? { size_kb: Math.round(statSync(newMp4).size / 1024), frames: nr.frames } : { fail: nr.reason };
      }
    } else {
      writeFileSync(path.join(OUT, `${id}_NEW_fail.json`), JSON.stringify({ state: gen.state, reason: gen.reason, boards: (gen.boards ?? []) }, null, 2));
      if (gen.boards) gen.boards.forEach((bd) => { if (bd.b64) writeFileSync(path.join(OUT, "boards", `${id}_board${bd.index}_${bd.role}_FAILED.png`), Buffer.from(bd.b64, "base64")); });
    }
  }
  results[id] = rec;
  console.log(`  ${id}: OLD ${rec.old.status}(pace ${rec.old.pacing}) | NEW ${rec.new?.status ?? "not generated"} ${rec.new ? `concept ${rec.new.concept} ${rec.new.boards}b $${rec.new.cost_usd} ${(rec.new.ms / 1000).toFixed(0)}s` : ""}${rec.new?.render ? ` | MP4 old ${rec.old.render?.size_kb ?? "-"}kb new ${rec.new.render?.size_kb ?? rec.new.render?.fail ?? "-"}kb` : ""}`);
}

// ---- cost + index ------------------------------------
const cost = costReport(budgets);
const perVideo = budgets.length ? Math.round((cost.total_cost_usd / budgets.length) * 100) / 100 : 0;
const costOut = { openai_image_gen_calls: cost.background_generations, vision_audit_calls: cost.visual_review_calls, total_cost_usd: cost.total_cost_usd, cost_per_finished_video_usd: perVideo, est_cost_per_10_videos_usd: Math.round(perVideo * 10 * 100) / 100, render_is_local_compute_only: true };

const esc = (x) => String(x ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rows = stories.map((s) => {
  const r = results[s.id] ?? {};
  const oldVid = existsSync(path.join(OUT, "media", `${s.id}_OLD.mp4`)) ? `<video src="media/${s.id}_OLD.mp4" controls muted playsinline width="200"></video>` : "&mdash;";
  const newVid = existsSync(path.join(OUT, "media", `${s.id}_NEW.mp4`)) ? `<video src="media/${s.id}_NEW.mp4" controls muted playsinline width="200"></video>` : "&mdash;";
  const boards = (r.new?.board_roles ?? []).map((role, i) => `<img src="boards/${s.id}_board${i}_${role}.png" width="120" title="${role}">`).join(" ");
  return `<tr><td>${s.id}<br><small>${esc(s.family ?? s.status ?? "")}</small></td><td>OLD ${esc(r.old?.status ?? "-")}<br>pace ${esc(r.old?.pacing ?? "-")}<br>${oldVid}</td><td>NEW ${esc(r.new?.status ?? "-")}<br>concept ${esc(r.new?.concept ?? "-")} · $${esc(r.new?.cost_usd ?? "-")}<br>${newVid}</td><td>${boards}</td></tr>`;
}).join("");
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><title>4C.1 generative video proof</title>
<style>body{font:14px system-ui;background:#0b0b0d;color:#eee;margin:24px;max-width:1300px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:8px;vertical-align:top}video,img{border:1px solid #333;border-radius:6px}a{color:#9ad}</style>
<h1>SOCIAL-CREATIVE-4C.1 — OpenAI designs the scenes, code animates them</h1>
<p>generated ${new Date().toISOString()} &nbsp; ai: <b>${AI ? "ON" : "OFF"}</b> &nbsp; render: <b>${RENDER ? "ON" : "OFF"}</b></p>
<table><tr><th>story</th><th>OLD 4C (sparse template)</th><th>NEW 4C.1 (generative art direction)</th><th>scene boards</th></tr>${rows}</table>
<p>Per story: <code>&lt;ID&gt;_OLD_plan.json</code> · <code>&lt;ID&gt;_NEW_boards.json</code> (+prompts) · <code>_NEW_motion.json</code> · <code>_NEW_audits.json</code> · <code>boards/</code></p>
<h2>Cost</h2><pre>${esc(JSON.stringify(costOut, null, 2))}</pre>
<p><b>READINESS: OWNER_REVIEW_REQUIRED</b> — owner is the final visual gate; the difference should be obvious.</p>`);
writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ ai: AI, render: RENDER, concepts: CONCEPTS, results, cost: costOut }, null, 2));

console.log(`\nWrote ${path.relative(ROOT, OUT)}/index.html`);
console.log(`READINESS: OWNER_REVIEW_REQUIRED`);
