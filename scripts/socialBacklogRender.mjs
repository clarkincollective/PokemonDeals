#!/usr/bin/env node
// Phase SOCIAL-NEWSROOM-2C - `npm run social:backlog-render`
//
//   node scripts/socialBacklogRender.mjs [--proof-seed] [--render] [--json]
//
//   --proof-seed   persist a fixed, small, distinct-layout proof story set
//                  (idempotent via stableStoryId). No render.
//   --render       (default) for every persisted PLANNED placement whose
//                  series is renderable: build editorial HTML -> real PNG
//                  via lib/social/render -> host via lib/social/storage ->
//                  deterministic QA -> OpenAI Layer-5 review -> on full
//                  PASS: patch the placement to BUFFER_READY.
//   --render --queue-after   also runs the feed review over the final set.
//
// Reuses the EXISTING renderer, storage provider and hosted-assets
// registry. No new rendering/hosting system. NOTHING is published or
// scheduled here. No eBay call.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import { createRenderer } from "../lib/social/render.mjs";
import { getStorageProvider } from "../lib/social/storage/index.mjs";
import { sha256, storageKeyFor, loadHostedAssets, saveHostedAssets, findByHash, buildHostedRecord, canHost } from "../lib/social/storage/hostedAssets.mjs";
import { RIGHTS_STATE } from "../lib/social/rights.mjs";
import { execSync } from "node:child_process";

import {
  loadStories, loadPlacements, tablesReady, upsertStory, upsertPlacements, patchPlacement, recordQaRun,
  artifactQueueEligible, latestQaForArtifact,
} from "../lib/social/newsroom/db.mjs";
import {
  makeStory, storyRow, placementRows, qaRunRow, quantizedCapturedAtIso, stableStoryId,
  placementsForStory, organicScore, runQaStack, feedReview, logEvent, captionDuplicateCheck,
} from "../lib/social/newsroom/index.mjs";
import { SERIES_RENDER, seriesRenderable, seriesAutonomousSafe, AUTONOMOUS_SAFE_LAYOUTS, layoutFamilyFor, renderablePlatformsFor, buildEditorialAsset, newsroomRights } from "../lib/social/newsroom/renderRegistry.mjs";
import { familyStatusFor as cardFamilyStatusFor, VISUAL_REVIEW_POLICY_VERSION, CARD_LAYOUT_CTA_ZONE } from "../lib/social/newsroom/cardLayoutStatus.mjs";
import { renderCardForwardStory, isCardForwardSeries, CARD_FORWARD_SERIES } from "../lib/newsroom/cardForwardRender.mjs";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { EDITORIAL_TARGETS } from "../lib/social/newsroom/editorialTemplates.mjs";
import { platformCaptions } from "../lib/social/newsroom/captions.mjs";
import { reviewRenderedCreative, reviewAvailable } from "../lib/newsroom/visualReview.mjs";
import { resolveBacklogPosture, normaliseSchedule, brisbaneWallToUtc, feedReview as feedReviewFn, MAX_QUEUE_PER_PLATFORM_PER_RUN } from "../lib/social/newsroom/index.mjs";
import { scheduleOne, reconcileOne, queuedContentStale, resolveProviderMode } from "../lib/newsroom/bufferBacklog.mjs";
import { getSocialProvider } from "../lib/social/providers/index.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const JSON_OUT = has("--json");
const DO_SEED = has("--proof-seed");
const DO_QUEUE = has("--queue-proof");
const DO_AUDIT_LEGACY = has("--audit-legacy");
const APPLY_AUDIT = has("--apply");
const CANCEL_DRAFT = has("--cancel-draft") ? argVal("--cancel-draft") : null;
const DO_RENDER = has("--render") || (!DO_SEED && !DO_QUEUE && !CANCEL_DRAFT && !DO_AUDIT_LEGACY);
const NOW = Date.now();
const ROOT = process.cwd();
const RENDER_DIR = path.join(ROOT, ".social-preview", "editorial-newsroom", "renders");
const OUT = path.join(ROOT, ".social-preview", "editorial-newsroom");
const log = (...a) => { if (!JSON_OUT) console.log(...a); };
const gitHead = () => { try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { return null; } };

// The fixed proof set: 5 series, 5 distinct layout families, mixed CTA.
// SOCIAL-NEWSROOM-3B: the proof set is now the CARD-FORWARD families. The
// old typographic proof series (PRICE_STORY / BIGGEST_MOVERS / ...) are no
// longer seeded - they were the weak creative bar this whole arc replaced.
const PROOF_SERIES = has("--legacy-proof-set")
  ? ["MARKET_SNAPSHOT", "HOW_WE_FIND_DEALS", "METHODOLOGY", "WHY_SOLD_PRICES_MATTER", "EXACT_PRINTING_MATTERS"]
  : ["MARKET_SNAPSHOT", "EXACT_PRINTING_MATTERS", "WHY_SOLD_PRICES_MATTER", "THREE_UNDER_25", "DEAL_DROP"];

async function seedProof() {
  const sourceCommit = gitHead();
  let stories = 0, placements = 0, preserved = 0;
  // SOCIAL-NEWSROOM-2D: a full upsert would REPLACE the row and null the
  // provider/schedule/QA state of an already-queued placement (this
  // orphaned real Buffer posts once). Preserve those fields for any
  // placement that is past PLANNED.
  const existing = Object.fromEntries(((await loadPlacements({})).rows).map((p) => [p.placement_id, p]));
  for (const series of PROOF_SERIES) {
    const subjectId = `${series.toLowerCase()}-proof`;
    const capturedAt = quantizedCapturedAtIso(series, { now: NOW });
    const facts = proofFacts(series);
    const cardForward = isCardForwardSeries(series);
    const story = makeStory({ series, subjectType: cardForward ? "card_forward" : SERIES_RENDER[series] ? "editorial" : "concept", subjectId, capturedAt, facts, sourceCommit, now: NOW });
    story.story_id = stableStoryId({ series, subjectType: "editorial", subjectId, now: NOW });
    story.organic_score = organicScore(story);
    story.status = "PLANNED";
    // SS10/SS14 - a DEAL_DROP card-forward story is near-term/live-like:
    // a SHORT shelf life so it can only take a near-term slot.
    if (series === "DEAL_DROP") { story.shelf_life_class = "SHORT"; story.latest_safe_publish_at = new Date(NOW + 30 * 3_600_000).toISOString(); story.valid_until = story.latest_safe_publish_at; }
    const sr = await upsertStory(storyRow(story, { now: NOW, sourceCommit }));
    if (sr.error) throw new Error(`seed story ${series}: ${sr.error}`);
    stories += sr.wrote;
    // card-forward proof -> IG + X (static post); typographic -> renderRegistry platforms
    const wanted = cardForward ? ["instagram", "x"] : renderablePlatformsFor(series);
    const basePls = cardForward
      ? wanted.map((platform) => ({
          placement_id: `plc_${createHash("sha256").update(`${story.story_id}::${platform}`).digest("hex").slice(0, 12)}`,
          platform, placement_type: "post", clock: story.shelf_life_class ?? "EDITORIAL",
        }))
      : placementsForStory(story).filter((p) => wanted.includes(p.platform));
    const pls = basePls.map((p) => ({ ...p, content_id: story.story_id }));
    const rows = placementRows(story, pls, { now: NOW }).map((row) => {
      const ex = existing[row.placement_id];
      if (ex && ex.status && ex.status !== "PLANNED") {
        preserved++;
        return { ...row, status: ex.status, artifact_hash: ex.artifact_hash, hosted_url: ex.hosted_url, buffer_provider_ref: ex.buffer_provider_ref, scheduled_for: ex.scheduled_for, provider_state: ex.provider_state, published_at: ex.published_at, platform_post_url: ex.platform_post_url, caption_style: ex.caption_style ?? row.caption_style };
      }
      return row;
    });
    const pr = await upsertPlacements(rows);
    if (pr.error) throw new Error(`seed placements ${series}: ${pr.error}`);
    placements += pr.wrote;
    logEvent("STORY_CREATED", { story_id: story.story_id, series, lane: story.lane, proof: true });
  }
  return { stories, placements, preserved };
}

// Deterministic proof facts. Aggregate/editorial only - no card artwork,
// no live deal claim. The MARKET_SNAPSHOT / BIGGEST_MOVERS numbers come
// from the data brief already recorded in memory (seo-gsc-authority) +
// the current catalogue; they are illustrative-but-real editorial
// context, clearly framed as observations.
function proofFacts(series) {
  switch (series) {
    case "PRICE_STORY":
      return {
        headline_fact: "The listing 38% under the highest ask still lost to a plainer one.",
        reveal: "Different set number, +$9 shipping, GBP not USD. Landed, the 'cheaper' card was $12 more.",
        layout_family: "story_reveal", numeric_structure: "compare",
      };
    case "BIGGEST_MOVERS":
      return {
        headline_fact: "Biggest 7-day market-reference moves",
        rows: [
          { name: "Umbreon VMAX (Evolving Skies)", deltaPct: 6.8 },
          { name: "Charizard ex (Obsidian Flames)", deltaPct: 4.1 },
          { name: "Mewtwo (Base Set, PSA 7)", deltaPct: -2.3 },
          { name: "Sylveon ex (Surging Sparks)", deltaPct: -3.9 },
          { name: "Lugia V Alt Art (Silver Tempest)", deltaPct: 5.2 },
        ],
        observation_note: "Move vs the prior 7-day median reference. Observations, not advice.",
        layout_family: "data_ranking", numeric_structure: "ranking",
      };
    case "MARKET_SNAPSHOT":
      return {
        headline_fact: "The Pokemon single-card market, in four numbers",
        stats: [
          { label: "Priced cards tracked", value: "21,775" },
          { label: "Median card value", value: "$1.61" },
          { label: "Under $25", value: "84.4%" },
          { label: "$100 or more", value: "5.2%" },
        ],
        source: "PokemonDealFinder catalogue snapshot; references via PokemonPriceTracker.",
        layout_family: "editorial_dashboard", numeric_structure: "distribution",
      };
    case "HOW_WE_FIND_DEALS":
      return { headline_fact: "How a listing actually becomes a deal", layout_family: "process_explainer" };
    case "METHODOLOGY":
      return { headline_fact: "What counts as a deal here", layout_family: "trust_editorial" };
    default:
      return { layout_family: layoutFamilyFor(series) };
  }
}

// map (layout, story) -> the EDITORIAL creative-QA meta (SS8). Reflects
// the real composition so the density/hierarchy checks are meaningful.
function editorialMetaFor(layout, target, hookText, story, ctaIntensity, bodyText) {
  const t = EDITORIAL_TARGETS[target] ?? EDITORIAL_TARGETS.ig_45;
  const f = story.facts_json ?? {};
  let statCallouts = [];
  if (layout === "editorial_dashboard") statCallouts = (f.stats ?? []).map((s) => s.value);
  else if (layout === "data_ranking") statCallouts = (f.rows ?? []).map((r) => `${Number(r.deltaPct) >= 0 ? "+" : ""}${Number(r.deltaPct).toFixed(1)}%`);
  const cta = ctaIntensity === "NONE" ? 0 : 1;
  return {
    editorial: true,
    layout_family: layout,
    target,
    safe: { top: t.safe.t, right: t.safe.r, bottom: t.safe.b, left: t.safe.l },
    hookText,
    hookPx: target === "short_916" ? 82 : 62,
    ctaCount: cta,
    wordmarkCount: 1,
    minInlineFontPx: 22,
    statCallouts,
    bodyChars: String(bodyText ?? "").length,
  };
}

// SOCIAL-NEWSROOM-3B SS23 - classify every existing BUFFER_READY /
// BUFFER_QUEUED placement against the CURRENT creative bar. A placement
// whose layout family is one of the OLD typographic layouts is
// LEGACY_WEAK_CREATIVE and must not autonomously queue - mark it
// SUPERSEDED (history preserved: artifact_hash / hosted_url kept).
const TYPOGRAPHIC_LAYOUTS = new Set(["editorial_dashboard", "data_ranking", "story_reveal", "process_explainer", "trust_editorial", "compare_split"]);
async function auditLegacyBufferReady({ apply = false } = {}) {
  if (!(await tablesReady())) return { error: "MIGRATION_REQUIRED" };
  const { rows: placements } = await loadPlacements({ statuses: ["BUFFER_READY", "BUFFER_QUEUED", "QA_WATCH"] });
  const { rows: stories } = await loadStories({});
  const byId = Object.fromEntries(stories.map((s) => [s.story_id, s]));
  const findings = [];
  for (const p of placements) {
    const st = byId[p.story_id];
    const lf = p.caption_style?.layout_family ?? null;
    const cf = st && isCardForwardSeries(st.series);
    let cls;
    if (st && queuedContentStale(st, p, { now: NOW })) cls = "STALE";
    else if (cf && lf && CARD_FORWARD_SERIES[st.series]?.layout === lf) cls = "CURRENT_CREATIVE_BAR_PASS";
    else if (lf && TYPOGRAPHIC_LAYOUTS.has(lf)) cls = "LEGACY_WEAK_CREATIVE";
    else if (cf) cls = "SUPERSEDED"; // card-forward series but rendered with a non-card-forward layout
    else cls = "SUPERSEDED";
    const f = { placement_id: p.placement_id, story_id: p.story_id, series: st?.series ?? null, platform: p.platform, status: p.status, layout_family: lf, classification: cls, has_provider_ref: Boolean(p.buffer_provider_ref) };
    if (apply && (cls === "LEGACY_WEAK_CREATIVE" || cls === "SUPERSEDED") && p.status === "BUFFER_READY" && !p.buffer_provider_ref) {
      await patchPlacement(p.placement_id, { status: "SUPERSEDED", provider_state: "SUPERSEDED_CREATIVE_BAR" });
      f.applied = "status -> SUPERSEDED";
    }
    findings.push(f);
  }
  const counts = findings.reduce((a, f) => { a[f.classification] = (a[f.classification] ?? 0) + 1; return a; }, {});
  return { total: findings.length, counts, applied: apply, findings };
}

async function renderPass() {
  if (!(await tablesReady())) return { error: "MIGRATION_REQUIRED" };
  if (!existsSync("C:/Program Files/Google/Chrome/Application/chrome.exe") && !process.env.CHROME_BIN) {
    // still attempt; render.mjs may resolve Chrome differently
  }
  mkdirSync(RENDER_DIR, { recursive: true });

  const { rows: placementRowsAll } = await loadPlacements({});
  const { rows: storyRowsAll } = await loadStories({});
  const storyById = Object.fromEntries(storyRowsAll.map((s) => [s.story_id, s]));

  // Scope to the PROOF set only (subject_id ends in "-proof") so earlier
  // calendar-built stories of the same series don't collide. Dedup by
  // (story_id, platform).
  // SS3/SS5 - MANUAL_ONLY families NEVER render to an autonomous artifact.
  // Card-forward families use the card-forward path; a small set of still-
  // valid typographic editorial series (methodology / product) may still
  // render. The retired weak typographic proof series are excluded.
  const TYPO_EDITORIAL_OK = new Set(["METHODOLOGY", "PRODUCT_EXPLAINER", "HOW_WE_FIND_DEALS"]);
  const renderInScope = (series) => {
    const S = String(series || "").toUpperCase();
    if (cardFamilyStatusFor(S) === "MANUAL_ONLY") return false;
    if (isCardForwardSeries(S)) return true;
    return TYPO_EDITORIAL_OK.has(S) && seriesRenderable(S);
  };

  const seen = new Set();
  const targets = placementRowsAll.filter((p) => {
    const st = storyById[p.story_id];
    if (!st) return false;
    if (!renderInScope(st.series)) return false;
    if (!String(st.subject_id ?? "").endsWith("-proof")) return false;
    // BUFFER_QUEUED is included so a re-render can CATCH + downgrade a
    // draft whose exact artifact no longer PASSes (SS2 - never leave
    // invalid queued creative silently present).
    if (!["PLANNED", "RENDERED", "QA_WATCH", "BUFFER_READY", "BUFFER_QUEUED"].includes(p.status)) return false;
    const k = `${p.story_id}|${p.platform}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const storage = getStorageProvider();
  const hosted = loadHostedAssets();
  const renderer = await createRenderer();
  const results = [];
  const readySet = [];

  const db = supabaseAdmin();
  try {
    for (const p of targets) {
      const story = storyById[p.story_id];
      if (!story) continue;

      // ---- SOCIAL-NEWSROOM-3B: CARD-FORWARD render path (SS3-SS12) -----
      if (isCardForwardSeries(story.series)) {
        const cf = await renderCardForwardStory(story, p.platform, { renderer, db, renderDir: RENDER_DIR, sha256 });
        if (!cf.ok) {
          // SS5 - NO typographic fallback. Record the withhold, leave the
          // placement PLANNED (a future run may find data), downgrade a
          // stale BUFFER_READY/QUEUED.
          await recordQaRun(qaRunRow({ storyId: story.story_id, placementId: p.placement_id, qaType: "STACK", result: "WATCH", blockers: [cf.withheld.reason], detail: { card_forward: true, withheld: cf.withheld } }));
          if (["BUFFER_READY", "BUFFER_QUEUED"].includes(p.status)) await patchPlacement(p.placement_id, { status: "QA_WATCH" });
          results.push({ placement_id: p.placement_id, story_id: story.story_id, series: story.series, platform: p.platform, card_forward: true, withheld: cf.withheld, status: "WITHHELD" });
          continue;
        }
        const cVerdict = cf.conditional
          ? (cf.consensus?.result === "PASS" ? "PASS" : cf.consensus?.result === "BLOCKED" ? "FAIL" : "WATCH")
          : (cf.review?.verdict ?? "WATCH");
        const detPass = cf.det_pass;
        const canProceed = detPass && cVerdict === "PASS";

        let hostedUrl = null, hostErr = null;
        if (canProceed) {
          const existing = findByHash(hosted, cf.sha256Hex);
          if (existing?.public_url) hostedUrl = existing.public_url;
          else {
            const gate = canHost({ localPath: cf.localPath, bytes: cf.bytes, mime: "image/png",
              qa: { ok: true, passed: 3, total: 3, failed: [] }, rights: newsroomRights(), currentRights: RIGHTS_STATE });
            if (!gate.ok) hostErr = `canHost: ${gate.reason}`;
            else {
              const up = await storage.upload({ storageKey: storageKeyFor(cf.sha256Hex, ".png"), bytes: cf.bytes, contentType: "image/png" });
              if (!up.ok) hostErr = `upload: ${up.reason}`;
              else {
                hostedUrl = up.publicUrl;
                const rec = buildHostedRecord({ content_id: story.story_id, creative_family: cf.layout, artifact_type: cf.target === "short_916" ? "image_916" : "image_45", platform_eligibility: [p.platform], localPath: cf.localPath, bytes: cf.bytes, mime: "image/png", width: 1080, height: cf.target === "short_916" ? 1920 : 1350, qa: { ok: true, passed: 3, total: 3, failed: [] }, rights: newsroomRights(), sourceCommit: gitHead() });
                rec.storage_provider = "supabase"; rec.public_url = up.publicUrl; rec.uploaded_at = new Date().toISOString();
                const hd = await storage.head(up.publicUrl);
                rec.verified = { at: new Date().toISOString(), status: hd.status, contentType: hd.contentType, contentLength: hd.contentLength };
                hosted.push(rec); saveHostedAssets(hosted);
                logEvent("ASSET_HOSTED", { story_id: story.story_id, platform: p.platform, sha: cf.sha256Hex.slice(0, 12), card_forward: true });
              }
            }
          }
        }

        // SS11/SS12 - persist the artifact-scoped QA rows the queue path consumes
        await recordQaRun(qaRunRow({ storyId: story.story_id, placementId: p.placement_id, qaType: "STACK", result: detPass ? "PASS" : (cf.det_ok ? "WATCH" : "FAIL"), blockers: cf.deterministic.failed, detail: { card_forward: true, layout: cf.layout, eqa: cf.deterministic.eqa, ca: cf.deterministic.ca, family: cf.deterministic.family, artifact_sha256: cf.sha256Hex } }));
        await recordQaRun(qaRunRow({ storyId: story.story_id, placementId: p.placement_id, qaType: "VISUAL_REVIEW", result: cVerdict, blockers: cf.consensus?.reasons ?? cf.review?.blockers ?? [],
          detail: cf.conditional
            ? { card_forward: true, artifact_sha256: cf.sha256Hex, consensus_result: cf.consensus?.result ?? "HELD", policy_version: cf.policy_version, review_count: cf.consensus?.review_count ?? null, pass_count: cf.consensus?.pass_count ?? null, watch_count: cf.consensus?.watch_count ?? null, fail_count: cf.consensus?.fail_count ?? null, core_score: cf.consensus?.core_score ?? null, verdicts: cf.consensus?.verdicts ?? null, calls: cf.consensus?.calls ?? null }
            : { card_forward: true, artifact_sha256: cf.sha256Hex, verdict: cf.review?.verdict, ai_spam: cf.review?.scores?.AI_SPAM_RISK ?? null, notes: (cf.review?.notes ?? []).slice(0, 3), policy_version: cf.policy_version } }));

        const ready = canProceed && Boolean(hostedUrl) && !hostErr;
        if (ready) {
          await patchPlacement(p.placement_id, { status: "BUFFER_READY", artifact_hash: cf.sha256Hex, hosted_url: hostedUrl,
            caption_style: { platform: p.platform, layout_family: cf.layout, cta_zone: CARD_LAYOUT_CTA_ZONE[cf.layout] ?? "foot_note", cta_intensity: cf.layout === "deal_hero" || cf.layout === "three_up" ? "SOFT" : "BRAND_ONLY", hook: story.facts_json?.headline_fact ?? story.series.replace(/_/g, " "), text: "", hashtags: [], link: null } });
          readySet.push({ story, placement: p, layout: cf.layout, cta_zone: CARD_LAYOUT_CTA_ZONE[cf.layout] ?? "foot_note", platform: p.platform });
        } else if (["BUFFER_READY", "BUFFER_QUEUED"].includes(p.status)) {
          await patchPlacement(p.placement_id, { status: "QA_WATCH", artifact_hash: cf.sha256Hex });
        }
        results.push({ placement_id: p.placement_id, story_id: story.story_id, series: story.series, platform: p.platform, card_forward: true,
          layout_family: cf.layout, target: cf.target, artifact_sha256: cf.sha256Hex, bytes: cf.bytes.length,
          deterministic_qa: detPass ? "PASS" : (cf.det_ok ? "WATCH" : "FAIL"), det_failed: cf.deterministic.failed,
          visual_review: cf.conditional ? { verdict: cVerdict, consensus: cf.consensus?.result, verdicts: cf.consensus?.verdicts, calls: cf.consensus?.calls, core_score: cf.consensus?.core_score } : { verdict: cVerdict, ai_spam_risk: cf.review?.scores?.AI_SPAM_RISK ?? null },
          family_status: cf.family_status, policy_version: cf.policy_version,
          hosted_url: hostedUrl, host_error: hostErr, local_path: path.relative(ROOT, cf.localPath),
          art: cf.art_stats, near_term_only: cf.near_term_only,
          status: ready ? "BUFFER_READY" : "HELD" });
        continue;
      }

      const asset = buildEditorialAsset(story, p.platform);
      if (!asset) { results.push({ placement_id: p.placement_id, platform: p.platform, skipped: "series not renderable for this platform" }); continue; }
      const caps = platformCaptions(story, { cta: asset.cta_intensity });
      const cap = caps[p.platform] ?? caps.x;

      // 1. render
      const localPath = path.join(RENDER_DIR, `${story.series.toLowerCase()}_${p.platform}_${p.placement_id.slice(-8)}.png`);
      await renderer.renderToPng(asset.html, localPath);
      let bytes = readFileSync(localPath);
      let sha = sha256(bytes);

      // 2. deterministic QA
      let qa = runQaStack(
        { ...story, facts_json: story.facts_json ?? {}, deal_ids: story.deal_ids ?? [] },
        {
          creativeMeta: editorialMetaFor(asset.layout_family, asset.target, cap.hook, story, asset.cta_intensity, cap.text),
          rights: { rightsCleared: true, artifactIsOwnRender: true },
          requireVisualReview: false,
          originalityContext: [],
          sequenceOk: true,
        }
      );

      // 3. OpenAI Layer-5 on the REAL png. Editorial context so the
      // card-centric rubric doesn't penalise a deliberately card-free
      // editorial/data composition (SS9/SS10).
      const reviewCtx = {
        platform: p.platform, family: asset.layout_family, series: story.series,
        hookText: cap.hook, editorial: true, ctaIntensity: asset.cta_intensity,
      };
      let review = await reviewRenderedCreative(localPath, reviewCtx, {});
      let reRendered = false;

      // 4. host (only if QA + review both PASS - fail-closed, SS8/SS20)
      const qaOk = qa.professional_result === "PASS";
      const reviewOk = review.verdict === "PASS";
      let hostedUrl = null, hostErr = null;
      if (qaOk && reviewOk) {
        const existing = findByHash(hosted, sha);
        if (existing?.public_url) {
          hostedUrl = existing.public_url;
        } else {
          const gate = canHost({
            localPath, bytes, mime: "image/png",
            qa: { ok: true, passed: qa.layers.length, total: qa.layers.length, failed: [] },
            rights: newsroomRights(), currentRights: RIGHTS_STATE,
          });
          if (!gate.ok) { hostErr = `canHost: ${gate.reason}`; }
          else {
            const key = storageKeyFor(sha, ".png");
            const up = await storage.upload({ storageKey: key, bytes, contentType: "image/png" });
            if (!up.ok) hostErr = `upload: ${up.reason} ${up.detail ?? ""}`.trim();
            else {
              hostedUrl = up.publicUrl;
              const rec = buildHostedRecord({
                content_id: story.story_id, creative_family: asset.layout_family,
                artifact_type: asset.target === "short_916" ? "image_916" : "image_45",
                platform_eligibility: [p.platform], localPath, bytes, mime: "image/png",
                width: EDITORIAL_TARGETS[asset.target].w, height: EDITORIAL_TARGETS[asset.target].h,
                qa: { ok: true, passed: qa.layers.length, total: qa.layers.length, failed: [] },
                rights: newsroomRights(), sourceCommit: gitHead(),
              });
              rec.storage_provider = "supabase";
              rec.public_url = up.publicUrl;
              rec.uploaded_at = new Date().toISOString();
              // verify public accessibility
              const hd = await storage.head(up.publicUrl);
              rec.verified = { at: new Date().toISOString(), status: hd.status, contentType: hd.contentType, contentLength: hd.contentLength, rangeOk: null };
              hosted.push(rec);
              saveHostedAssets(hosted);
              logEvent("ASSET_HOSTED", { story_id: story.story_id, platform: p.platform, sha: sha.slice(0, 12), status: hd.status });
            }
          }
        }
      }

      // 5. persist QA runs (ARTIFACT-SCOPED: every run carries the exact
      //    artifact sha so the queue path can enforce the SS3 invariant).
      await recordQaRun(qaRunRow({ storyId: story.story_id, placementId: p.placement_id, qaType: "STACK", result: qa.professional_result, score: organicScore(story), blockers: qa.blockers, detail: { layout: asset.layout_family, artifact_sha256: sha } }));
      await recordQaRun(qaRunRow({ storyId: story.story_id, placementId: p.placement_id, qaType: "VISUAL_REVIEW", result: review.verdict, score: review.scores?.AI_SPAM_RISK ?? null, blockers: review.blockers ?? [], detail: { model: review.model ?? null, notes: (review.notes ?? []).slice(0, 3), cached: review.cached ?? false, artifact_sha256: sha } }));
      logEvent(qa.professional_result === "PASS" ? "QA_PASS" : qa.professional_result === "WATCH" ? "QA_WATCH" : "QA_FAIL", { story_id: story.story_id, platform: p.platform, sha: sha.slice(0, 12) });

      const ready = qaOk && reviewOk && Boolean(hostedUrl) && !hostErr;
      if (ready) {
        await patchPlacement(p.placement_id, {
          status: "BUFFER_READY",
          artifact_hash: sha,
          hosted_url: hostedUrl,
          caption_style: { platform: p.platform, cta_intensity: asset.cta_intensity, cta_zone: asset.cta_zone, hook: cap.hook, text: cap.text, hashtags: cap.hashtags, link: cap.link, layout_family: asset.layout_family },
        });
        readySet.push({ story, placement: p, layout: asset.layout_family, cta_zone: asset.cta_zone, platform: p.platform });
      } else if (["BUFFER_READY", "BUFFER_QUEUED"].includes(p.status)) {
        // SS2 - a re-render that no longer PASSes must NEVER leave a
        // previously-ready/queued placement in that state. Downgrade to
        // QA_WATCH; if a provider draft exists, flag it for owner removal
        // (we never silently keep invalid queued creative).
        const patch = { status: "QA_WATCH", artifact_hash: sha };
        let providerDelete = null;
        if (p.buffer_provider_ref) {
          // a not-yet-sent draft/scheduled post for a now-invalid artifact
          // is removed from the provider immediately (deletePost refuses a
          // sent post); the local ref is cleared.
          try {
            const prov = getSocialProvider();
            const before = await prov.getPostStatus(p.buffer_provider_ref);
            if (!(before.ok && before.published)) {
              providerDelete = await prov.deletePost(p.buffer_provider_ref);
              if (providerDelete.deleted) { patch.buffer_provider_ref = null; patch.scheduled_for = null; patch.provider_state = "CANCELLED_INVALID"; }
              else patch.provider_state = "INVALIDATED_LOCAL";
            } else patch.provider_state = "ALREADY_SENT_MANUAL_REVIEW";
          } catch { patch.provider_state = "INVALIDATED_LOCAL"; }
          logEvent("BUFFER_DRIFT", { placement_id: p.placement_id, was: p.status, now: "QA_WATCH", provider_ref: p.buffer_provider_ref, reason: `re-render ${qa.professional_result}/${review.verdict}`, provider_deleted: Boolean(providerDelete?.deleted) });
        }
        await patchPlacement(p.placement_id, patch);
        results.push({ placement_id: p.placement_id, story_id: story.story_id, series: story.series, platform: p.platform, downgraded_from: p.status, to: "QA_WATCH", deterministic_qa: qa.professional_result, visual_review: review.verdict, provider_ref: p.buffer_provider_ref ?? null, provider_delete: providerDelete });
        continue;
      }

      results.push({
        placement_id: p.placement_id, story_id: story.story_id, series: story.series, platform: p.platform,
        layout_family: asset.layout_family, target: asset.target,
        dimensions: `${EDITORIAL_TARGETS[asset.target].w}x${EDITORIAL_TARGETS[asset.target].h}`,
        local_path: path.relative(ROOT, localPath), artifact_sha256: sha, bytes: bytes.length,
        deterministic_qa: qa.professional_result, qa_blockers: qa.blockers,
        visual_review: { verdict: review.verdict, available: review.available, ai_spam_risk: review.scores?.AI_SPAM_RISK ?? null, blockers: review.blockers ?? [], notes: (review.notes ?? []).slice(0, 3), re_rendered: reRendered, cached: review.cached ?? false },
        hosted_url: hostedUrl, host_error: hostErr,
        caption_hook: cap.hook, cta_intensity: asset.cta_intensity,
        status: ready ? "BUFFER_READY" : "HELD",
      });
    }
  } finally {
    await renderer.close();
  }

  // feed review over the BUFFER_READY set - uses each layout's REAL
  // wordmark/CTA zone so "identical CTA placement" reflects the design.
  const feed = feedReview(readySet.map((r) => ({
    story: { ...r.story, facts_json: { ...(r.story.facts_json ?? {}), layout_family: r.layout, cta_zone: r.cta_zone, loud_brand: false } },
  })));
  logEvent("FEED_REVIEW", { verdict: feed.verdict, sample: feed.sample });

  return { results, feed, buffer_ready: readySet.length };
}

// ---- SS16-SS22: SMALL FUTURE BUFFER PROOF QUEUE (draft mode) --------
// Requires SOCIAL_BUFFER_BACKLOG_ENABLED=true in the env. Uses the
// EXISTING adapter via scheduleOne(). DRAFT mode: a Buffer draft with a
// future dueAt - a real provider write that NEVER auto-publishes (SS20/
// SS24). To make one a genuine auto-publishing scheduled post, re-run
// with SOCIAL_BUFFER_BACKLOG_MODE=scheduled.
async function queueProof() {
  if (!(await tablesReady())) return { error: "MIGRATION_REQUIRED" };
  const posture = resolveBacklogPosture(process.env, { requestQueue: true });
  const mode = resolveProviderMode(process.env); // "draft" (default) | "scheduled"
  if (!posture.canQueueProvider) return { blocked: posture.reason, posture, mode };

  const prov = getSocialProvider();
  const ch = await prov.listChannels();
  if (!ch.ok) return { blocked: `listChannels: ${ch.reason}`, posture, mode };
  const channelByService = {};
  for (const c of ch.channels ?? []) {
    const svc = c.service === "twitter" ? "x" : c.service;
    if (["instagram", "x", "tiktok", "youtube"].includes(svc) && !c.disconnected && !c.locked) channelByService[svc] = c.id;
  }

  const { rows: placements } = await loadPlacements({ statuses: ["BUFFER_READY"] });
  const { rows: stories } = await loadStories({});
  const byId = Object.fromEntries(stories.map((s) => [s.story_id, s]));
  // idempotent: never re-queue a placement that already has a provider ref
  const alreadyQueued = new Set(placements.filter((p) => p.buffer_provider_ref).map((p) => p.placement_id));

  // curate: strongest + most diverse, <= MAX per platform, prefer distinct
  // series + distinct layout families. IG + X only for the proof.
  // X is the proof surface: it accepts a text+image post via the Buffer
  // API cleanly. Instagram via Buffer returns InvalidInputError for our
  // editorial image posts (a known Buffer-IG integration constraint -
  // documented, not chased). SS18 explicitly allows not forcing every
  // platform. Set SOCIAL_BUFFER_PROOF_PLATFORMS to override.
  const proofPlatforms = String(process.env.SOCIAL_BUFFER_PROOF_PLATFORMS ?? "x").split(",").map((s) => s.trim()).filter(Boolean);
  const proof = placements
    .filter((p) => String(byId[p.story_id]?.subject_id ?? "").endsWith("-proof"))
    .filter((p) => !alreadyQueued.has(p.placement_id))
    .filter((p) => p.artifact_hash && p.hosted_url)
    .filter((p) => p.status === "BUFFER_READY") // never a downgraded/held placement
    .filter((p) => seriesAutonomousSafe(byId[p.story_id]?.series)) // SS7 - reliable-PASS layouts only
    .filter((p) => AUTONOMOUS_SAFE_LAYOUTS.includes(p.caption_style?.layout_family))
    .filter((p) => proofPlatforms.includes(p.platform) && channelByService[p.platform]);
  // strictly distinct series AND distinct layout family; <= 2 per
  // platform; cap 3 (SS18). Distinctness is what makes FEED_PASS reachable.
  // SS21: scheduled mode is a genuine auto-publishing proof -> MAXIMUM 1
  // per platform. Draft mode may take up to MAX_QUEUE_PER_PLATFORM_PER_RUN.
  const perPlatformCap = mode === "scheduled" ? 1 : MAX_QUEUE_PER_PLATFORM_PER_RUN;
  const runCap = mode === "scheduled" ? 2 : 3;
  const pickedSeries = new Set();
  const pickedLayout = new Set();
  const perPlatform = {};
  const chosen = [];
  for (const p of proof) {
    const st = byId[p.story_id];
    const lf = p.caption_style?.layout_family;
    if ((perPlatform[p.platform] ?? 0) >= perPlatformCap) continue;
    if (pickedSeries.has(st.series) || pickedLayout.has(lf)) continue;
    chosen.push({ p, st, lf });
    pickedSeries.add(st.series);
    pickedLayout.add(lf);
    perPlatform[p.platform] = (perPlatform[p.platform] ?? 0) + 1;
    if (chosen.length >= runCap) break;
  }

  // SS13 - feed gate over the curated proof subset. Never queue on
  // FEED_WATCH / FEED_FAIL.
  const feed = feedReviewFn(chosen.map((c) => ({
    story: { ...c.st, facts_json: { ...(c.st.facts_json ?? {}), layout_family: c.p.caption_style?.layout_family, cta_zone: c.p.caption_style?.cta_zone, loud_brand: false } },
  })));
  if (feed.verdict !== "FEED_PASS") {
    return { posture, mode, feed, blocked: `feed review ${feed.verdict}: ${(feed.warnings ?? []).join("; ")}`, chosen: chosen.length, queued: 0, results: [] };
  }

  // Brisbane future times: 3-4 DAYS out (SS24 - the owner must be able to
  // review/cancel in Buffer well before delivery), 10:00 / 16:00 Brisbane.
  const bris = new Date(NOW + 10 * 3_600_000); // now in Brisbane wall time
  const slots = [
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 3, hh: 10 }),
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 3, hh: 16 }),
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 4, hh: 10 }),
    brisbaneWallToUtc({ y: bris.getUTCFullYear(), m: bris.getUTCMonth() + 1, d: bris.getUTCDate() + 4, hh: 16 }),
  ];

  // SS13 - X value/duplication guard: an X placement's caption must not be
  // a near-duplicate (or an identical numeric skeleton) of another X
  // caption already queued/ready.
  const existingXCaptions = placements
    .filter((x) => x.platform === "x" && x.caption_style?.text && !chosen.some((c) => c.p.placement_id === x.placement_id))
    .map((x) => ({ platform: "x", caption: x.caption_style.text }));

  const results = [];
  for (let i = 0; i < chosen.length; i++) {
    const { p, st } = chosen[i];
    if (p.platform === "x") {
      const dup = captionDuplicateCheck({ platform: "x", caption: p.caption_style?.text ?? "" }, existingXCaptions);
      if (dup.blocked) {
        results.push({ story_id: p.story_id, series: st.series, placement_id: p.placement_id, platform: "x", queued: false, reason: `x_duplicate_caption: ${dup.reason}` });
        continue;
      }
      existingXCaptions.push({ platform: "x", caption: p.caption_style?.text ?? "" });
    }
    const dueUtc = slots[i % slots.length];
    const sched = normaliseSchedule(dueUtc);
    if (queuedContentStale(st, { ...p, status: "BUFFER_QUEUED", scheduled_for: dueUtc }, { now: NOW })) {
      results.push({ story_id: p.story_id, series: st.series, placement_id: p.placement_id, platform: p.platform, queued: false, reason: "QUEUED_CONTENT_STALE", valid_until: st.valid_until, scheduled_for: dueUtc });
      continue;
    }
    // SS3/SS4 - the artifact-scoped QA invariant. The LATEST STACK + the
    // LATEST LAYER-5 verdict FOR THIS EXACT artifact sha must both be
    // PASS. A stale/story-level/layout-level PASS never authorises.
    // SOCIAL-CREATIVE-3C: a CONDITIONAL card-forward family (e.g. deal_hero)
    // additionally needs a visual-CONSENSUS PASS under the current policy
    // version; AUTONOMOUS_SAFE families keep the original contract.
    const famStatus = cardFamilyStatusFor(st.series) ?? "AUTONOMOUS_SAFE";
    const artifactQa = await artifactQueueEligible({
      placementId: p.placement_id, artifactSha: p.artifact_hash,
      familyStatus: famStatus, policyVersion: VISUAL_REVIEW_POLICY_VERSION,
    });
    const stackVerdict = artifactQa.stack?.verdict ?? "MISSING";
    if (!artifactQa.ok) {
      results.push({ story_id: p.story_id, series: st.series, placement_id: p.placement_id, platform: p.platform, queued: false, reason: `artifact_qa_invariant: ${artifactQa.reason}`, artifact_hash: (p.artifact_hash ?? "").slice(0, 16) });
      continue;
    }
    logEvent("BUFFER_QUEUE_REQUEST", { story_id: p.story_id, platform: p.platform, scheduled_for: dueUtc, mode, artifact_sha: (p.artifact_hash ?? "").slice(0, 12) });
    const r = await scheduleOne({
      story: st, placement: p,
      channelId: channelByService[p.platform],
      caption: p.caption_style?.text ?? "",
      dueAtUtc: dueUtc, professionalResult: stackVerdict, artifactQa, mode,
    });
    if (r.queued) {
      await patchPlacement(p.placement_id, { ...r.placement_patch, scheduled_for: dueUtc });
      logEvent("BUFFER_QUEUED", { story_id: p.story_id, platform: p.platform, provider_ref: r.provider_ref, provider_state: r.provider_state });
      // immediate reconcile (SS21)
      const rc = await reconcileOne({ placement: { ...p, buffer_provider_ref: r.provider_ref, scheduled_for: dueUtc } });
      logEvent("BUFFER_RECONCILED", { placement_id: p.placement_id, provider_state: rc.providerState, published: Boolean(rc.published) });
      results.push({
        story_id: p.story_id, series: st.series, placement_id: p.placement_id, platform: p.platform,
        layout_family: p.caption_style?.layout_family, artifact_hash: (p.artifact_hash ?? "").slice(0, 16),
        provider_ref: r.provider_ref, provider_state: r.provider_state,
        scheduled_for_utc: sched.scheduled_for_utc, scheduled_for_local: sched.scheduled_for_local,
        reconcile: { ok: rc.ok, published: Boolean(rc.published), provider_state: rc.providerState ?? null, drift: rc.drift ?? null },
        queued: true,
      });
    } else {
      results.push({ story_id: p.story_id, platform: p.platform, queued: false, reason: r.reason, blockers: r.blockers });
    }
  }
  return { posture, mode, feed, channels: Object.keys(channelByService), candidates: proof.length, chosen: chosen.length, queued: results.filter((r) => r.queued).length, results };
}

// ---- SS2/SS19: operator-only removal of an invalid Buffer draft -----
async function cancelDraft(ref) {
  if (!(await tablesReady())) return { error: "MIGRATION_REQUIRED" };
  const { rows: pl } = await loadPlacements({});
  const p = pl.find((x) => x.buffer_provider_ref === ref);
  const prov = getSocialProvider();
  if (!prov.isConfigured?.()) return { error: "BUFFER_ACCESS_TOKEN not set" };
  const before = await prov.getPostStatus(ref);
  if (before.ok && before.published) return { ref, error: "REFUSING: provider reports this post already sent", provider_state: before.statusRaw };
  const del = await prov.deletePost(ref);
  let localPatch = null;
  if (p) {
    localPatch = { status: "QA_WATCH", buffer_provider_ref: null, scheduled_for: null, provider_state: "CANCELLED_INVALID" };
    await patchPlacement(p.placement_id, localPatch);
    await recordQaRun(qaRunRow({ storyId: p.story_id, placementId: p.placement_id, qaType: "STACK", result: "WATCH", blockers: ["draft cancelled - latest LAYER-5 verdict for the queued artifact was WATCH (SS2)"], detail: { artifact_sha256: p.artifact_hash, cancelled_provider_ref: ref } }));
    logEvent("BUFFER_DRIFT", { placement_id: p.placement_id, provider_ref: ref, action: "cancelled_invalid_draft", provider_delete_ok: del.ok });
  }
  const after = await prov.getPostStatus(ref);
  return { ref, provider_before: before.statusRaw ?? null, provider_delete: del, provider_after: after.ok ? after.statusRaw : after.reason, local_placement: p?.placement_id ?? null, local_patch: localPatch };
}

// --------------------------------------------------------------------
(async () => {
  mkdirSync(OUT, { recursive: true });
  const payload = { generated_at: new Date(NOW).toISOString(), visual_review_configured: reviewAvailable() };

  if (CANCEL_DRAFT) {
    const c = await cancelDraft(CANCEL_DRAFT);
    payload.cancel_draft = c;
    log(`cancel-draft ${CANCEL_DRAFT}: ${JSON.stringify(c)}`);
    writeFileSync(path.join(OUT, "cancel-draft.json"), JSON.stringify(payload, null, 2) + "\n");
    if (JSON_OUT) console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (DO_AUDIT_LEGACY) {
    const a = await auditLegacyBufferReady({ apply: APPLY_AUDIT });
    payload.legacy_audit = a;
    log(`legacy audit: ${JSON.stringify(a.counts)}${a.applied ? " (APPLIED)" : " (dry - pass --apply to mark SUPERSEDED)"}`);
    for (const f of a.findings ?? []) log(`  ${f.classification.padEnd(24)} ${(f.series ?? "?").padEnd(22)} ${f.platform.padEnd(10)} ${f.status.padEnd(13)} ${f.layout_family ?? "-"}${f.applied ? "  -> " + f.applied : ""}`);
    writeFileSync(path.join(OUT, "legacy-audit.json"), JSON.stringify({ generated_at: payload.generated_at, legacy_audit: a }, null, 2) + "\n");
    if (JSON_OUT) console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (DO_SEED) {
    const s = await seedProof();
    payload.proof_seed = s;
    log(`proof-seed: stories +${s.stories}, placements +${s.placements} (card-forward: ${PROOF_SERIES.join(", ")})`);
  }

  if (DO_RENDER) {
    const r = await renderPass();
    payload.render = r;
    if (r.error) {
      log(`render: ${r.error}`);
    } else {
      for (const it of r.results) {
        const lf = it.layout_family ?? it.withheld?.reason ?? it.skipped ?? (it.downgraded_from ? `downgraded<-${it.downgraded_from}` : "-");
        const l5 = it.visual_review?.verdict ?? it.visual_review?.consensus ?? "-";
        log(`  ${String(it.series ?? "?").padEnd(20)} ${String(it.platform ?? "-").padEnd(10)} ${String(lf).padEnd(24)} QA=${it.deterministic_qa ?? "-"} L5=${l5}${it.visual_review?.ai_spam_risk != null ? `(spam ${it.visual_review.ai_spam_risk})` : ""} -> ${it.status ?? "-"}${it.host_error ? ` [${it.host_error}]` : ""}${it.card_forward ? " [card-forward]" : ""}`);
      }
      log(`  feed review: ${r.feed.verdict}${r.feed.warnings?.length ? ` (${r.feed.warnings.join("; ")})` : ""}`);
      log(`  BUFFER_READY: ${r.buffer_ready}`);
    }
  }

  if (DO_QUEUE) {
    const q = await queueProof();
    payload.queue_proof = q;
    if (q.error) log(`queue-proof: ${q.error}`);
    else if (q.blocked) log(`queue-proof: BLOCKED - ${q.blocked}`);
    else {
      log(`queue-proof: mode ${q.mode} | channels ${q.channels.join(",")} | chosen ${q.chosen} | queued ${q.queued}`);
      for (const r of q.results) {
        if (r.queued) log(`  ${r.series} ${r.platform} -> ref ${r.provider_ref} state=${r.provider_state} @ ${r.scheduled_for_local} | reconcile published=${r.reconcile.published} state=${r.reconcile.provider_state}`);
        else log(`  ${r.series ?? r.story_id} ${r.platform} -> NOT queued: ${r.reason}`);
      }
    }
  }

  // render results and queue results go to separate files so one never
  // clobbers the other (quality-audit reads render-results.json).
  if (payload.render) writeFileSync(path.join(OUT, "render-results.json"), JSON.stringify({ generated_at: payload.generated_at, visual_review_configured: payload.visual_review_configured, render: payload.render }, null, 2) + "\n");
  if (payload.queue_proof) writeFileSync(path.join(OUT, "queue-proof.json"), JSON.stringify({ generated_at: payload.generated_at, queue_proof: payload.queue_proof }, null, 2) + "\n");
  writeFileSync(path.join(OUT, "render-proof.json"), JSON.stringify(payload, null, 2) + "\n");
  if (JSON_OUT) console.log(JSON.stringify(payload, null, 2));
})().catch((e) => { console.error("social:backlog-render failed:", e?.stack || e?.message || e); process.exit(1); });
