#!/usr/bin/env node
// LOCAL, FREE visual-authenticity Stage 2 (27 Sep 2026).
//
//   node scripts/visual/screenLocal.mjs                  # the queue: up to --batch rows
//   node scripts/visual/screenLocal.mjs --ids=42912      # specific rows (held or not)
//   node scripts/visual/screenLocal.mjs --dry ...        # classify + report, write nothing
//   options: --batch=40 --model=qwen2.5vl:7b   (env OLLAMA_HOST, default http://127.0.0.1:11434)
//
// WHY. The production worker (app/api/screen-visual-authenticity) runs Stage 1
// (free image statistics, lib/visualAuthenticity) and then Stage 2, a vision
// model call, for everything Stage 1 leaves UNKNOWN. Stage 2 ran on a paid
// API whose balance ran out on 21 Sep 2026; the owner's decision (27 Sep) is
// not to fund it. Measured that day: the Stage-1 statistics alone cannot
// separate the confirmed counterfeits from genuine cards (metallic-hue and
// grey fractions overlap across every class), so a vision model IS needed -
// and the owner's always-on PC has an RTX 4090. This script is the SAME
// pipeline (lib/visualAuthenticity.screenDeal, same prompt, same verdict
// vocabulary, same persistence and hold rules as the route) with Stage 2
// served by a local open-weight model through Ollama. Cost: electricity.
//
// QUEUE. Active raw candidates (isVisualScreeningCandidate) that were never
// screened, or whose last screen ended "vision_unavailable", or whose verdict
// is older than RESCREEN_AFTER_DAYS. Never-screened first, then oldest. The
// production route keeps running Stage 1 and stamping vision_unavailable
// (its API has no credit); this script is what turns those into verdicts.
//
// WRITES (not with --dry): visual_authenticity_status / _reason / _checked_at,
// and for a COUNTERFEIT verdict the row's own hold plus the copy hold on
// other marketplaces - exactly the route's rules - and the affected cache tags
// are queued for the next sweep-stale-deals run. Nothing is ever released here.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const require = createRequire(import.meta.url);
const va = require("../../lib/visualAuthenticity.js");
const L = require("../../lib/listingAvailability.js");
const { catalogImageUrl } = require("../../lib/cardImage.js");

const argv = process.argv.slice(2);
const flag = (name, dflt = null) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};
const DRY = flag("dry") === true;
const IDS = String(flag("ids", "")).split(",").map((s) => s.trim()).filter(Boolean).map(Number);
const BATCH = Number(flag("batch", 40)) || 40;
// Measured 27 Sep on the confirmed gold-plate fake (42912) + four known rows:
// qwen2.5vl:7b called the plate "genuine holographic" on the full prompt;
// qwen2.5vl:32b said "non-paper metallic construction, no halftone pattern"
// (COUNTERFEIT), reproduced the paid model's IDENTITY_MISMATCH on 34574 and
// matched the genuine rows. ~30 s per row on an RTX 4090, 20 GB of VRAM.
const MODEL = String(flag("model", process.env.LOCAL_VISION_MODEL || "qwen2.5vl:32b"));
const OLLAMA = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
const RESCREEN_AFTER_DAYS = 21;
const OLLAMA_BIN = process.env.OLLAMA_BIN || `${process.env.LOCALAPPDATA ?? ""}\\Programs\\Ollama\\ollama.exe`;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("  Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(2);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const COLS =
  "id, listing_id, marketplace, watchlist_id, card_name, card_set, card_tcgplayer_id, image_url, image_urls, market_price, discount_pct, is_graded, " +
  "price, total_price, total_price_usd, disqualified_reason, seller_feedback_score, image_count, returns_accepted, " +
  "visual_authenticity_status, visual_authenticity_checked_at, visual_authenticity_reason";

// ---------------------------------------------------------------- ollama
async function ollamaReady() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { up: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    const have = (j.models ?? []).some((m) => m.name === MODEL || m.name === `${MODEL}:latest` || m.model === MODEL);
    return { up: true, have };
  } catch (e) {
    return { up: false, error: e?.message ?? String(e) };
  }
}

function startOllama() {
  // `ollama serve` directly, detached and hidden: it needs no desktop
  // session, so it also works when this task runs at the login screen
  // (the tray app, by contrast, only starts inside an interactive logon).
  if (!existsSync(OLLAMA_BIN)) return;
  const { spawn } = require("node:child_process");
  const child = spawn(OLLAMA_BIN, ["serve"], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

function pullModel() {
  if (!existsSync(OLLAMA_BIN)) throw new Error(`ollama not found at ${OLLAMA_BIN}`);
  const r = spawnSync(OLLAMA_BIN, ["pull", MODEL], { stdio: "inherit", windowsHide: true });
  if (r.status !== 0) throw new Error(`ollama pull ${MODEL} failed (${r.status})`);
}

async function toJpegBase64(buffer) {
  const sharp = require("sharp");
  const data = await sharp(buffer).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return data.toString("base64");
}

async function chatJson(content, images, { numPredict = 200, key = "verdict" } = {}) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: "json",
      // 5 min: the model is unloaded between hourly runs instead of sitting
      // resident. num_ctx 6144: the model's default 32k context spilled a
      // 29 GB working set into system RAM (26% CPU / 74% GPU) and starved
      // the machine (694 MB free of 31 GB, the first backlog run was killed);
      // the prompt is ~700 tokens and two 1024 px images ~2,500.
      keep_alive: "5m",
      options: { temperature: 0, num_predict: numPredict, num_ctx: 6144 },
      messages: [{ role: "user", content, images }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`http_${res.status} ${(await res.text()).replace(/\s+/g, " ").slice(0, 160)}`);
  const body = await res.json();
  const text = String(body?.message?.content ?? "");
  const m = text.match(new RegExp(`\\{[^{}]*"${key}"[^{}]*\\}`));
  if (!m) throw new Error(`no_json_${key}:${text.slice(0, 60)}`);
  return JSON.parse(m[0]);
}

// A NARROW second question on the listing photo alone: what is the object
// made of? Measured 27 Sep on the 7B model: the full classification prompt
// called the gold-plate fake "genuine holographic", while this question
// answered "metal, gold plated" for it and "paper" for the canonical scan -
// but it also called a genuine yellow-bordered paper card "plastic". So
// neither answer is trusted alone; the two must AGREE (below).
const MATERIAL_PROMPT =
  "Look at this photo of a Pokemon trading card. Answer ONLY with a JSON object: " +
  '{"material":"paper|metal|plastic|unsure","gold_plated":true|false,"reason":"<short>"}. ' +
  "Genuine Pokemon TCG cards are printed on paper card stock, sometimes with a holographic foil layer on the ARTWORK or a textured full-art foil, " +
  "and many have a yellow printed border - that is paper. Novelty 'gold cards' are solid metal or plastic plates with a mirror-like gold surface " +
  "across the WHOLE card including the text boxes, with engraved or relief lettering.";

// The Stage-2 call, same prompt and verdict vocabulary as the production
// worker, served by the local model. Returns { status, reason } or
// { unavailable } like lib/visualAuthenticity.visionClassify.
//
// LOCAL-MODEL POLICY (stricter than the paid API's, because an open 7B-32B
// model is less reliable): a COUNTERFEIT verdict is kept only when the
// material question independently says metal/plastic; a MATCH is kept only
// when the material question says paper. Any disagreement is UNKNOWN - the
// verdict that hides nothing and accuses nobody. IDENTITY_MISMATCH passes
// through (it is a "different genuine card" call, never an accusation).
//
// EVERY listing photo is asked the material question when the verdict is
// COUNTERFEIT (measured: the 32B model called the gold plate's FRONT "paper"
// but its BACK "metal, gold plated" - a plain gold back is unmistakable, and
// deals.image_urls keeps the seller's other photos). A MATCH is confirmed on
// the front photo only.
function localVisionFor(row) {
  const extraUrls = (Array.isArray(row.image_urls) ? row.image_urls : []).filter((u) => typeof u === "string" && /^https?:\/\//.test(u) && u !== row.image_url).slice(0, 3);
  return async function localVision({ card, canonBuf, listBuf }) {
    if (!canonBuf?.length || !listBuf?.length) return { unavailable: "no_image" };
    let canon, listing;
    try {
      canon = await toJpegBase64(canonBuf);
      listing = await toJpegBase64(listBuf);
    } catch (e) {
      return { unavailable: `encode:${String(e?.message ?? e).slice(0, 60)}` };
    }
    try {
      const parsed = await chatJson(va.visionPrompt(card), [canon, listing]);
      const raw = String(parsed.verdict || "").toUpperCase().replace(/[\s-]+/g, "_");
      const status = va.normalizeVisionVerdict(raw);
      if (!status) return { unavailable: `unrecognised_verdict:${raw.slice(0, 30)}` };
      const reason = `vision(${MODEL}):${String(parsed.reason || "").slice(0, 140)}`;
      if (status === va.VERDICTS.IDENTITY || status === va.VERDICTS.UNKNOWN) return { status, reason };

      const genuineIsMetal = va.catalogIsGoldOrMetalProduct ? va.catalogIsGoldOrMetalProduct(card) : false;
      const materials = [];
      const probe = async (b64) => {
        const mat = await chatJson(MATERIAL_PROMPT, [b64], { numPredict: 150, key: "material" });
        const material = String(mat.material || "unsure").toLowerCase();
        materials.push(material);
        return material;
      };
      const front = await probe(listing);
      if (status === va.VERDICTS.COUNTERFEIT) {
        let plate = front === "metal" || front === "plastic";
        for (const url of extraUrls) {
          if (plate) break;
          try {
            const m = await probe(await toJpegBase64(await fetchImage(url)));
            plate = m === "metal" || m === "plastic";
          } catch {
            materials.push("unreadable");
          }
        }
        // NEVER an automatic accusation from the local model. Reviewed by eye
        // on 27 Sep: of its first four COUNTERFEIT calls (all with a
        // material probe agreeing), three were genuine cards - a Garchomp in
        // a display holder, a rainbow-rare Umbreon, a gold-bordered Classic
        // Articuno - and one was a fan-made card sold under a real promo's
        // name. A hold hides a real deal; UNKNOWN only keeps it out of the
        // premium slots. So a local COUNTERFEIT is recorded as a SUSPECT
        // (catalog_snapshot "visual_suspects" + .local/visual-suspects.log)
        // for the owner to confirm with scripts/remediation/holdReportedListing.mjs.
        // Measured on the first full pass (173 rows): the model said
        // COUNTERFEIT on 107 - 62% of the queue - and the material probe
        // agreed on NONE of them. A COUNTERFEIT call without material
        // agreement is noise, so it is plain UNKNOWN; only an agreeing call
        // (a metal/plastic object where the printing is paper) is a suspect.
        if (plate && !genuineIsMetal) {
          return {
            status: va.VERDICTS.UNKNOWN,
            reason: `suspected_counterfeit(local,material_agrees): ${String(parsed.reason || "").slice(0, 120)} | material:${materials.join("/")}`,
            suspect: { evidence: String(parsed.reason || "").slice(0, 160), materials: materials.join("/"), agrees: true },
          };
        }
        return { status: va.VERDICTS.UNKNOWN, reason: `unconfirmed_counterfeit_call(local): ${String(parsed.reason || "").slice(0, 120)} | material:${materials.join("/")}` };
      }
      // MATCH
      if (front === "paper" || genuineIsMetal) return { status, reason: `${reason} | material:${front}` };
      return { status: va.VERDICTS.UNKNOWN, reason: `${reason} | material:${front} (no agreement, not matched)` };
    } catch (e) {
      return { unavailable: `${e?.name ?? "error"}:${String(e?.message ?? "").slice(0, 100)}` };
    }
  };
}

// The review list: a rolling catalog_snapshot row (newest first, 200 max) and
// a local log line. The owner confirms with
//   node scripts/remediation/holdReportedListing.mjs --ids=<id> --apply --confirm=1 --prior-out=<file>
const SUSPECTS_KIND = "visual_suspects";
async function recordSuspect(row, verdict) {
  const entry = {
    id: row.id,
    at: new Date().toISOString(),
    title: String(row.card_name ?? "").slice(0, 80),
    set: String(row.card_set ?? "").slice(0, 60),
    marketplace: row.marketplace,
    market: row.market_price,
    discountPct: row.discount_pct,
    images: [row.image_url, ...((Array.isArray(row.image_urls) ? row.image_urls : []).filter((u) => u !== row.image_url))].slice(0, 4),
    page: `https://pokemondealfinder.com/deals/${row.id}`,
    // screenDeal rebuilds the verdict as { status, reason } (the `suspect`
    // field never survives), so read the evidence back out of the reason:
    //   suspected_counterfeit(local,material_agrees): <evidence> | material:<a/b>
    evidence: verdict.suspect?.evidence ?? (/\): (.*?) \| material:/.exec(verdict.reason ?? "")?.[1] ?? null),
    materials: verdict.suspect?.materials ?? (/\| material:([a-z/]+)/.exec(verdict.reason ?? "")?.[1] ?? null),
    materialAgrees: Boolean(verdict.suspect?.agrees) || /material_agrees/.test(verdict.reason ?? ""),
  };
  try {
    const { appendFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(".local", { recursive: true });
    appendFileSync(".local/visual-suspects.log", JSON.stringify(entry) + "\n");
  } catch {
    /* log is best-effort */
  }
  try {
    const { data } = await db.from("catalog_snapshot").select("data").eq("kind", SUSPECTS_KIND).maybeSingle();
    const list = Array.isArray(data?.data?.items) ? data.data.items.filter((s) => s.id !== row.id) : [];
    list.unshift(entry);
    await db.from("catalog_snapshot").upsert({ kind: SUSPECTS_KIND, data: { v: 1, items: list.slice(0, 200) }, updated_at: entry.at }, { onConflict: "kind" });
  } catch {
    /* the log line still exists */
  }
}

async function fetchImage(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 8_000_000) throw new Error("img too large");
  return buf;
}

// ---------------------------------------------------------------- queue
async function loadQueue() {
  if (IDS.length) {
    const { data, error } = await db.from("deals").select(COLS).in("id", IDS);
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  const staleCutoff = new Date(Date.now() - RESCREEN_AFTER_DAYS * 864e5).toISOString();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("deals").select(COLS).eq("is_active", true).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const due = rows.filter((row) => {
    if (row.disqualified_reason) return false; // already withheld; nothing to decide
    if (!va.isVisualScreeningCandidate(row)) return false;
    const at = row.visual_authenticity_checked_at;
    if (!at) return true;
    if (/vision_unavailable|worker_error|fetch_failed/.test(String(row.visual_authenticity_reason ?? ""))) return true;
    return at < staleCutoff;
  });
  due.sort((a, b) => String(a.visual_authenticity_checked_at ?? "") .localeCompare(String(b.visual_authenticity_checked_at ?? "")));
  return { due: due.slice(0, BATCH), totalDue: due.length, active: rows.length };
}

// ---------------------------------------------------------------- run
const started = Date.now();
// One worker at a time on this machine (the hourly task vs a long backlog
// run): a lock file younger than 3 h means another run is in progress.
const LOCK = ".local/visual-screen.lock";
if (!DRY) {
  try {
    const { statSync, writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(".local", { recursive: true });
    let held = false;
    try {
      held = Date.now() - statSync(LOCK).mtimeMs < 3 * 3600e3;
    } catch {
      held = false;
    }
    if (held) {
      console.log(JSON.stringify({ skipped: "another_run_in_progress", lock: LOCK }));
      process.exit(0);
    }
    writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}\n`);
    process.on("exit", () => {
      try {
        require("node:fs").unlinkSync(LOCK);
      } catch {
        /* already gone */
      }
    });
  } catch {
    /* lock is best-effort */
  }
}
const summary = { at: new Date().toISOString(), model: MODEL, dry: DRY, screened: 0, results: { MATCH: 0, COUNTERFEIT_MISMATCH: 0, IDENTITY_MISMATCH: 0, UNKNOWN: 0 }, unavailable: 0, held: 0, copiesHeld: 0, queuedTags: 0, errors: [], detail: [] };

let ready = await ollamaReady();
if (!ready.up) {
  startOllama();
  for (let i = 0; i < 20 && !ready.up; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    ready = await ollamaReady();
  }
}
if (!ready.up) {
  console.error(`  Ollama is not reachable at ${OLLAMA} (${ready.error}); install it (winget install Ollama.Ollama) and run again`);
  process.exit(2);
}
if (!ready.have) {
  console.error(`  pulling ${MODEL} (one-time download)`);
  pullModel();
}

const q = await loadQueue();
const rows = Array.isArray(q) ? q : q.due;
if (!Array.isArray(q)) Object.assign(summary, { totalDue: q.totalDue, active: q.active });

for (const row of rows) {
  const canonicalUrl = catalogImageUrl(row.card_tcgplayer_id);
  let verdict;
  try {
    verdict = await va.screenDeal({ row, canonicalUrl }, { fetchImage, vision: localVisionFor(row) });
  } catch (e) {
    verdict = { status: "UNKNOWN", reason: `worker_error:${String(e.message).slice(0, 80)}` };
  }
  summary.screened++;
  summary.results[verdict.status] = (summary.results[verdict.status] ?? 0) + 1;
  if (/vision_unavailable/.test(verdict.reason ?? "")) summary.unavailable++;
  const suspected = /^suspected_counterfeit\(local/.test(verdict.reason ?? "");
  if (suspected) summary.suspects = (summary.suspects ?? 0) + 1;
  const d = { id: row.id, from: row.visual_authenticity_status ?? null, status: verdict.status, reason: String(verdict.reason ?? "").slice(0, 140) };
  summary.detail.push(d);
  console.error(`  ${row.id} ${row.visual_authenticity_status ?? "-"} -> ${verdict.status}${suspected ? " (SUSPECT)" : ""}  ${d.reason}`);
  if (DRY) continue;
  if (suspected) await recordSuspect(row, verdict);

  const { error } = await db
    .from("deals")
    .update({ visual_authenticity_status: verdict.status, visual_authenticity_reason: verdict.reason?.slice(0, 500) ?? null, visual_authenticity_checked_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) {
    summary.errors.push(`${row.id}: ${error.message}`);
    continue;
  }
  const own = L.authenticityVerdictHold(verdict, row);
  if (own) {
    const h = await db.from("deals").update(own).eq("id", row.id).is("disqualified_reason", null).select("id");
    if (h.error) summary.errors.push(`${row.id} hold: ${h.error.message}`);
    else if ((h.data ?? []).length === 1) {
      summary.held++;
      d.held = true;
      const tags = [...L.retirementInvalidationPlan([row]).tags, ...L.surfaceInvalidationPlan([row], { dealPages: true }).tags];
      const queued = await L.queueCacheInvalidation(db, tags, { source: "screenLocal" });
      if (queued.error) summary.errors.push(`${row.id} queue: ${queued.error}`);
      else summary.queuedTags += queued.queued;
    }
  }
  if (L.COUNTERFEIT_VISUAL_VERDICTS.includes(verdict.status) && row.listing_id) {
    const held = await db.from("deals").update({ disqualified_reason: L.COPY_HOLD_REASON }).eq("listing_id", row.listing_id).neq("id", row.id).is("disqualified_reason", null).select("id");
    if (held.error) summary.errors.push(`${row.id} copies: ${held.error.message}`);
    else summary.copiesHeld += (held.data ?? []).length;
  }
}

summary.tookMs = Date.now() - started;
console.log(JSON.stringify(summary, null, 1));
process.exit(summary.errors.length ? 1 : 0);
