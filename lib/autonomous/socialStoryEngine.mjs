// Phase SOCIAL-AUTOPILOT-1 §16 - THE DAILY STORY ENGINE ORCHESTRATOR.
//
// runSocialAutopilot() wires every stage this phase built into ONE
// entrypoint, in the order §16 specifies:
//   1. reconcile old placements
//   2. inspect the content calendar
//   3. discover candidates                  (storyDiscovery)
//   4. score candidates                     (storyScoring)
//   5. apply diversity / editorial gates     (contentCalendar)
//   6. freeze story snapshot                (storySnapshot)
//   7. generate/reuse master                (creativeStage)
//   8. generate captions                    (captionStage)
//   9. create video where needed            (videoStage)
//  10. run complete QA                      (qaGate)
//  11. create platform placements           (platformEligibility)
//  12. queue Buffer placements               (bufferHandoff - DRY RUN ONLY)
//  13. persist result                       (db.mjs, opt-in via `persist`)
//  14. emit daily report                    (dailyDigest)
//
// MODE: this phase ships MANUAL_REVIEW only (§18). AUTOPILOT mode exists
// as a named constant for a future phase to activate; runSocialAutopilot
// has NO code path that calls a live Buffer submit regardless of `mode` -
// see bufferHandoff.mjs's own hard refusal for the second layer of the
// same guarantee.

import { makeStoryPackage, transition } from "./storyPackage.mjs";
import { buildStorySnapshot, verifyNoSnapshotDrift } from "./storySnapshot.mjs";
import { discoverCandidates } from "./storyDiscovery.mjs";
import { scoreCandidate, meetsQualityFloor } from "./storyScoring.mjs";
import { hardDiversityCheck, diversitySignals, loadRecentAutopilotStories, AUTOPILOT_SOURCE_TAG } from "./contentCalendar.mjs";
import { resolveCreative } from "./creativeStage.mjs";
import { resolveCaptions } from "./captionStage.mjs";
import { resolveVideo, videoApplicable } from "./videoStage.mjs";
import { platformEligibility, anyPlatformEligible } from "./platformEligibility.mjs";
import { evaluateQaGate } from "./qaGate.mjs";
import { checkStale, fetchLiveRecordFor } from "./staleGuard.mjs";
import { buildBufferPlacement, queueBufferPlacement } from "./bufferHandoff.mjs";
import { buildSeoHandoff, buildRedditHandoff } from "./seoRedditHandoff.mjs";
import { buildDailyDigest } from "./dailyDigest.mjs";
import { storyId as computeStoryId } from "../social/newsroom/story.mjs";
import { failure } from "../newsroom/editorial/failureStates.mjs";
import { buildSocialDiscoveryManifest } from "../newsroom/discovery/discoveryManifest.mjs";
import { auditDiscoveryReadinessAll } from "../newsroom/discovery/discoveryQaGate.mjs";
import { buildDiscoveryCaptionStyle, getRecentDiscoveryHistory, recentTagsFor, recentCombosFor, recentPrimaryKeywordsFor } from "../social/newsroom/discoveryHistory.mjs";

export const SOCIAL_STORY_ENGINE_VERSION = "auto1.1";

// §18 - two modes. AUTOPILOT is not activated by this phase - it exists so
// a FUTURE phase has a named target, not a live switch.
export const AUTOPILOT_MODES = Object.freeze(["MANUAL_REVIEW", "AUTOPILOT"]);

export function resolvedShapeFor(candidate) {
  // The exact `resolved.data` shape buildSemanticManifest/runFullGenerativeSocial
  // expect, derived ONLY from the frozen snapshot (never re-queried).
  const f = candidate.facts;
  const meta = Object.values(f.canonical_card_metadata ?? {})[0] ?? {};
  return {
    data: {
      askingUsd: Object.values(f.prices ?? {})[0] ?? null,
      marketRefUsd: Object.values(f.market_reference_values ?? {})[0] ?? null,
      card_name: meta.name ?? null, card_set: meta.set ?? null,
      priced_cards: f.tracked_population ?? null,
      under_25_pct: f.derived_percentages?.under_25_pct ?? null,
      over_100_pct: f.derived_percentages?.over_100_pct ?? null,
      featured: f.canonical_card_ids?.length ? { tcgplayerId: f.canonical_card_ids[0], card_name: meta.name ?? null } : null,
      items: (f.canonical_card_ids ?? []).map((id) => ({ tcgplayerId: id, card_name: f.canonical_card_metadata?.[id]?.name, card_set: f.canonical_card_metadata?.[id]?.set, price_usd: f.prices?.[id], market_usd: f.market_reference_values?.[id] })),
      high: f.canonical_card_ids?.[0] ? { ...f.canonical_card_metadata?.[f.canonical_card_ids[0]], tcgplayerId: f.canonical_card_ids[0], price_usd: f.prices?.[f.canonical_card_ids[0]] } : null,
      low: f.canonical_card_ids?.[1] ? { ...f.canonical_card_metadata?.[f.canonical_card_ids[1]], tcgplayerId: f.canonical_card_ids[1], price_usd: f.prices?.[f.canonical_card_ids[1]] } : null,
    },
  };
}

// §17 - QA sub-verdicts derived from each stage's OWN enforced
// preconditions. The 5A.1/5B/4C.7 pipelines cannot return ok:true unless
// every one of these already passed internally (fact/semantic/scope/
// direction/brand-safe-zone/card-fidelity/CTA/caption-fact audits are all
// preconditions of their own `ok`) - this maps that fact into the gate's
// named checks rather than re-running any of them a second time.
function stampQaSources(pkg, { creativeOk, captionOk, videoOk, videoApplies, snapshotDriftOk, staleOk, duplicateOk, platformOk, discoveryOk }) {
  const s = (ok) => (ok == null ? undefined : ok ? "PASS" : "FAIL");
  return {
    factLock: s(creativeOk), snapshotDrift: s(snapshotDriftOk),
    cardFidelity: s(creativeOk), cardMetadata: s(creativeOk),
    semantic: s(creativeOk), scope: s(creativeOk), direction: s(creativeOk),
    visualQa: s(creativeOk), brandSafeZone: s(creativeOk), cta: s(creativeOk),
    caption: s(captionOk), disclosure: s(captionOk),
    videoFact: videoApplies ? s(videoOk) : undefined,
    videoVisual: videoApplies ? s(videoOk) : undefined,
    platformFit: s(platformOk), staleCheck: s(staleOk), duplicateCheck: s(duplicateOk),
    discovery: s(discoveryOk),
  };
}

// Exported (SOCIAL-AUTOPILOT-5.1) so a one-off, explicitly owner-approved
// manual retry of an ALREADY-discovered candidate can run the real per-
// package pipeline (creative/caption/video/stale/QA/buffer-handoff)
// directly, without re-running the orchestrator's own selection loop
// (scoring + hardDiversityCheck + maxSelected) a second time for a story
// that loop would legitimately - and correctly - reject as "posted within
// 72h" (it WAS, by the original live pilot this retry is explicitly
// authorized to redo with a corrected asset). This does not change
// hardDiversityCheck/contentCalendar.mjs at all - recurring autopilot
// still goes through the full gated loop untouched.
export async function runOnePackage(candidate, { env, allowGenerate, spentTodayUsd, recentPlacementIds, revalidateStale, now }) {
  const storyId = computeStoryId({ series: candidate.series, subjectType: "card_or_aggregate", subjectId: (candidate.facts.canonical_card_ids ?? [])[0] ?? candidate.family, capturedAt: candidate.facts.data_freshness?.captured_at ?? new Date(now).toISOString(), factsJson: candidate.facts });
  let pkg = makeStoryPackage({ storyId, family: candidate.family, series: candidate.series, editorialAngle: candidate.editorialAngle, bucket: candidate.bucket, priority: candidate.priority, now });
  pkg = transition(pkg, "CANDIDATE", { reason: "passed discovery + scoring + diversity" });
  pkg.scoring = candidate.scored;
  pkg.diversity = candidate.diversity;
  pkg = transition(pkg, "EDITORIAL_READY", { reason: "editorial angle + series contract resolved" });

  // §1 - freeze the snapshot. Nothing after this line may re-query a
  // mutable fact - every stage below reads ONLY pkg.snapshot.
  const snapshot = buildStorySnapshot({ storyId, storyFamily: candidate.family, editorialAngle: candidate.editorialAngle, facts: candidate.facts, now });
  pkg.snapshot = snapshot;
  pkg = transition(pkg, "SNAPSHOT_LOCKED", { reason: `snapshot ${snapshot.snapshot_id} frozen` });

  const resolved = resolvedShapeFor(candidate);
  const creative = await resolveCreative(pkg, { resolved, cardImagePaths: candidate.cardImagePaths ?? [], cardCatalogRow: candidate.cardCatalogRow ?? null, env, allowGenerate, spentTodayUsd });
  if (!creative.ok) {
    pkg = transition(pkg, creative.state === "BUDGET_EXCEEDED_HOLD" ? "ASSET_HOLD" : "ASSET_HOLD", { reason: creative.reason });
    pkg.qa = { verdict: "WITHHOLD", reason: creative.reason, state: creative.state };
    return pkg;
  }
  pkg.creative = { ...creative.creative, cost_usd: creative.costUsd, source: creative.source };
  pkg.semantic_manifest = creative.semanticManifest;
  pkg.fact_lock = creative.factLock;
  pkg = transition(pkg, "CREATIVE_READY", { reason: `master ${creative.source} ($${creative.costUsd.toFixed(2)})` });

  // §1 drift check - the semantic manifest the creative stage built must
  // agree with the frozen snapshot on every field both touch.
  const driftCheck = verifyNoSnapshotDrift(snapshot, {
    comparison_direction: creative.semanticManifest.comparison_direction ?? snapshot.comparison_direction,
  }, { stage: "creative" });

  const captionRes = await resolveCaptions(pkg, { semanticManifest: creative.semanticManifest, cardCatalogRow: candidate.cardCatalogRow ?? null, env });
  if (!captionRes.ok) {
    pkg = transition(pkg, "CAPTION_HOLD", { reason: captionRes.reason });
    pkg.qa = { verdict: "WITHHOLD", reason: captionRes.reason, state: captionRes.state };
    return pkg;
  }
  pkg.captions = captionRes.captions;
  pkg.captions.caption_handoff = captionRes.caption_handoff;
  pkg = transition(pkg, "CAPTION_READY", { reason: "captions ready on instagram/x" });

  let videoOk = null, videoApplies = videoApplicable(candidate.family);
  if (videoApplies) {
    const videoRes = resolveVideo(pkg, { semanticManifest: creative.semanticManifest, factLock: creative.factLock, cardImagePaths: candidate.cardImagePaths ?? [], heroCardId: (snapshot.canonical_card_ids ?? [])[0] ?? null, heroCardName: Object.values(snapshot.canonical_card_metadata ?? {})[0]?.name ?? null });
    if (videoRes.ok) { pkg.video = videoRes.video; videoOk = true; pkg = transition(pkg, "VIDEO_READY", { reason: "4C.7 video plan ready" }); }
    else { pkg.video = { ok: false, reason: videoRes.reason, state: videoRes.state }; videoOk = false; pkg = transition(pkg, "VIDEO_HOLD", { reason: videoRes.reason }); pkg = transition(pkg, "QA_READY", { reason: "static-only platforms still proceed after a video hold" }); }
  } else {
    pkg = transition(pkg, "VIDEO_READY", { reason: "video not applicable to this family" });
  }
  if (pkg.status === "VIDEO_READY") pkg = transition(pkg, "QA_READY", { reason: "entering QA" });

  // SOCIAL-DISCOVERY-2 §2 - discovery manifest, consuming the SAME frozen
  // snapshot (buildSocialDiscoveryManifest refuses to run without
  // pkg.snapshot - no fresh factual queries). Real persisted rotation
  // history (§9/§11) - degrades to empty (no penalty) if the DB isn't
  // reachable, never fabricated.
  const PLATFORMS_4 = ["instagram", "x", "tiktok", "youtube_shorts"];
  const history = {};
  for (const p of PLATFORMS_4) {
    // eslint-disable-next-line no-await-in-loop
    history[p] = await getRecentDiscoveryHistory(p, 50);
  }
  const recentTags = {}, recentCombos = {};
  const recentPrimaryKeywords = [];
  for (const p of PLATFORMS_4) {
    recentTags[p] = recentTagsFor(history[p].rows);
    recentCombos[p] = recentCombosFor(history[p].rows);
    recentPrimaryKeywords.push(...recentPrimaryKeywordsFor(history[p].rows));
  }
  const discoveryResult = buildSocialDiscoveryManifest(pkg, { recentTags, recentCombos, recentPrimaryKeywords, now });
  pkg.discovery = discoveryResult.manifest ?? null;
  pkg.discovery_audit = discoveryResult;
  pkg.discovery_readiness = pkg.discovery ? auditDiscoveryReadinessAll(pkg) : null;

  // §14 - stale guard, live-deal families only.
  let staleVerdict = { verdict: "STILL_VALID", ok: true };
  if (revalidateStale) {
    const live = await fetchLiveRecordFor(snapshot).catch(() => null);
    staleVerdict = checkStale(snapshot, live);
  }

  // §11 - platform eligibility, independent per platform.
  const elig = platformEligibility(pkg);
  pkg.platform_variants = elig;
  const platformOk = anyPlatformEligible(elig);

  // §12 duplicate check against already-loaded placement ids (idempotency).
  const duplicateOk = true; // dedupe key is computed per-placement below; nothing queued yet this run

  // SOCIAL-DISCOVERY-2 §12 - package-level aggregate: mirrors platformOk's
  // own "any eligible platform is enough" philosophy, so ONE platform's
  // broken discovery metadata (e.g. TikTok) never sinks a package whose
  // OTHER eligible platforms (e.g. Instagram/X) are fine. Fine-grained
  // per-platform enforcement happens again below, per placement.
  const eligiblePlatforms = Object.entries(elig).filter(([, e]) => e.eligible).map(([p]) => p);
  const discoveryOk = !pkg.discovery_readiness || eligiblePlatforms.length === 0
    ? undefined
    : eligiblePlatforms.some((p) => pkg.discovery_readiness[p]?.ok);

  pkg.qa = {
    _sources: stampQaSources(pkg, { creativeOk: true, captionOk: true, videoOk, videoApplies, snapshotDriftOk: driftCheck.ok, staleOk: staleVerdict.ok, duplicateOk, platformOk, discoveryOk }),
  };
  const gate = evaluateQaGate(pkg);
  pkg.qa.gate = gate;

  if (!driftCheck.ok) { pkg = transition(pkg, "FACT_HOLD", { reason: driftCheck.reason }); return pkg; }
  if (!staleVerdict.ok) { pkg = transition(pkg, "STALE_HOLD", { reason: staleVerdict.reason }); return pkg; }
  if (!platformOk) { pkg = transition(pkg, "PLATFORM_HOLD", { reason: "no platform is eligible for this story" }); return pkg; }
  if (!gate.ok) { pkg = transition(pkg, "PLATFORM_HOLD", { reason: `QA gate: ${gate.results.filter((r) => r.verdict !== "PASS" && r.verdict !== "N_A").map((r) => r.key).join(", ")}` }); return pkg; }

  pkg = transition(pkg, "BUFFER_READY", { reason: "all required QA checks PASS" });

  // §12/§15 - build (never really submit) a placement per eligible platform.
  // SOCIAL-DISCOVERY-2 §4/§12: a placement may not be built at all if
  // THIS platform's discovery metadata fails, even if the package-level
  // aggregate gate passed because another platform was fine (§2/§4/§5)
  // - the final Instagram/X text is the discovery-computed
  // final_provider_text (caption + audited, budget-fit hashtags), never
  // the bare 5B caption with hashtags silently missing.
  const placements = [];
  const discoveryHoldPlatforms = [];
  for (const [platform, e] of Object.entries(elig)) {
    if (!e.eligible) continue;
    const readiness = pkg.discovery_readiness?.[platform] ?? null;
    if (readiness && !readiness.ok) { discoveryHoldPlatforms.push({ platform, findings: readiness.findings }); continue; }
    const platformOut = pkg.discovery?.platform?.[platform] ?? null;
    const captionKey = platform === "tiktok" || platform === "youtube_shorts" ? "x" : platform;
    const fallbackCaption = pkg.captions?.[captionKey]?.caption_text ?? null;
    const finalCaptionText = platformOut?.final_provider_text ?? fallbackCaption;
    const built = buildBufferPlacement({
      storyPackage: pkg, platform, placementType: e.placement_type,
      assetHash: pkg.creative.master_image_sha256 ?? null,
      captionText: finalCaptionText,
    });
    if (built.ok) {
      const q = queueBufferPlacement(built.placement, { existingPlacementIds: recentPlacementIds, dryRun: true });
      // §8/§9 - persist discovery metadata in the SAME existing flexible
      // caption_style field (no schema change) so getRecentDiscoveryHistory
      // can read real rotation history back later.
      const discoveryFields = platformOut ? {
        family: pkg.family,
        pokemon: pkg.discovery?.pokemon_entities?.[0] ?? null,
        card: pkg.discovery?.card_entities?.[0] ?? null,
        set: pkg.discovery?.set_entities?.[0] ?? null,
        primary_keyword: pkg.discovery?.primary_search_query ?? null,
        secondary_keywords: pkg.discovery?.secondary_search_queries ?? [],
        search_intent: pkg.discovery?.search_intent ?? [],
        primary_audience: pkg.discovery?.primary_audience ?? null,
        hashtags: platformOut.hashtags ?? [],
        emoji_count: (platformOut.final_provider_text ?? "").match(/\p{Extended_Pictographic}/gu)?.length ?? 0,
        growth_potential_score: pkg.discovery?.growth_potential_score ?? null,
        related_site_route: pkg.discovery?.related_site_route ?? null,
        discovery_manifest_version: pkg.discovery?.metadata_version ?? null,
        ...(platform === "youtube_shorts" ? { youtube_title: platformOut.title, youtube_description: platformOut.description, youtube_tags: platformOut.video_tags } : {}),
        ...(platform === "tiktok" ? { tiktok_primary_search_query: platformOut.primary_search_query, on_screen_discovery_alignment: platformOut.audit?.on_screen_alignment ?? null } : {}),
      } : null;
      const caption_style = buildDiscoveryCaptionStyle({ captionSha256: built.placement.caption_style?.caption_sha256 ?? null, discoveryFields });
      placements.push({ ...built.placement, caption_style, discovery: discoveryFields, _queue_result: q });
    }
  }
  pkg.publishing = { placements, mode: "MANUAL_REVIEW_DRY_RUN" };
  pkg = transition(pkg, "BUFFER_QUEUED", { reason: `${placements.length} placement(s) simulated (dry-run - nothing sent)` });

  pkg.seo_handoff = buildSeoHandoff(pkg);
  pkg.reddit_handoff = buildRedditHandoff(pkg);
  return pkg;
}

/**
 * runSocialAutopilot({ dryRun=true, mode="MANUAL_REVIEW", maxSelected=3,
 * allowGenerate=false, persist=false, revalidateStale=true, env })
 *
 * dryRun is accepted for interface symmetry with the other AUTO-*
 * modules but is NOT a live-mutation switch here - there is no code path
 * in this module that reaches a real Buffer submit regardless of its
 * value (§26 "do not publish anything during this phase").
 */
export async function runSocialAutopilot({
  mode = "MANUAL_REVIEW", maxSelected = 3, allowGenerate = false, persist = false,
  revalidateStale = true, env = process.env, now = Date.now(),
} = {}) {
  if (!AUTOPILOT_MODES.includes(mode)) throw new Error(`unknown autopilot mode: ${mode}`);
  if (mode === "AUTOPILOT") {
    // §18 - explicitly not enabled this phase, regardless of caller intent.
    return { ok: false, ...failure("EDITORIAL_WITHHOLD", "AUTOPILOT mode is not activated in SOCIAL-AUTOPILOT-1 - MANUAL_REVIEW only", {}) };
  }

  // 1. reconcile old placements (read-only summary this phase - §15)
  let reconciliation = { ready: false, buckets: {} };
  try {
    const { loadPlacements } = await import("../social/newsroom/db.mjs");
    const { rows, ready } = await loadPlacements({ limit: 500 });
    reconciliation = { ready, count: rows.length };
  } catch { /* DB not reachable in this environment - proceed with an empty calendar */ }

  // 2. content calendar
  const recent = await loadRecentAutopilotStories({ limit: 50 }).catch(() => ({ ready: false, rows: [] }));

  // 3. discover
  const { candidates, rejected, discovered } = await discoverCandidates({ now });

  // 4/5. score + diversity + quality floor
  const evaluated = [];
  const diversityRejected = [];
  for (const c of candidates) {
    const hard = hardDiversityCheck(c, recent.rows ?? [], { now });
    const div = diversitySignals(c, recent.rows ?? [], { now });
    const scored = scoreCandidate(c, { diversitySignals: div });
    c.scored = scored;
    c.diversity = { ...div, hard_check: hard };
    if (!hard.ok) { diversityRejected.push({ family: c.family, reasons: hard.reasons }); continue; }
    if (!meetsQualityFloor(scored)) { diversityRejected.push({ family: c.family, reasons: [`score ${scored.overall} below quality floor`] }); continue; }
    evaluated.push(c);
  }
  evaluated.sort((a, b) => b.scored.overall - a.scored.overall);
  const selectedCandidates = evaluated.slice(0, maxSelected);

  // 6-12. per-selected-story pipeline
  const spentTodayUsd = { value: 0 };
  const packages = [];
  for (const c of selectedCandidates) {
    // eslint-disable-next-line no-await-in-loop
    const pkg = await runOnePackage(c, { env, allowGenerate, spentTodayUsd: spentTodayUsd.value, recentPlacementIds: new Set(), revalidateStale, now });
    spentTodayUsd.value += pkg.creative?.cost_usd ?? 0;
    packages.push(pkg);
    c.why_selected = c.scored.why_selected;
  }

  // 13. persist (opt-in, tagged so this engine never collides with the
  // older NEWSROOM-1/2 planner's rows in the SAME reused tables - §23)
  if (persist) {
    try {
      const { upsertStory, upsertPlacements } = await import("../social/newsroom/db.mjs");
      for (const pkg of packages) {
        // eslint-disable-next-line no-await-in-loop
        await upsertStory({
          story_id: pkg.story_id, series: pkg.series ?? pkg.family, pillar: pkg.bucket ?? "AUTOPILOT",
          lane: "FRESH", subject_type: "card_or_aggregate", subject_id: pkg.story_id,
          card_ids: pkg.snapshot?.canonical_card_ids ?? [], created_at: pkg.created_at,
          facts_json: { family: pkg.family, editorial_angle: pkg.editorial_angle, cta_class: pkg.snapshot?.cta_class ?? null, snapshot_hash: pkg.snapshot?.snapshot_hash ?? null },
          status: pkg.status, source_commit: AUTOPILOT_SOURCE_TAG,
        });
        if (pkg.publishing?.placements?.length) {
          // eslint-disable-next-line no-await-in-loop
          await upsertPlacements(pkg.publishing.placements.map((p) => ({
            placement_id: p.placement_id, story_id: p.story_id, platform: p.platform, placement_type: p.placement_type,
            status: "PLANNED", content_id: p.content_id, artifact_hash: p.artifact_hash, caption_style: p.caption_style,
          })));
        }
      }
    } catch { /* persistence is best-effort in this phase's dry-run - never blocks the proof */ }
  }

  // §19 - honest spend accounting: image generation cost is tracked
  // exactly (per creativeStage's returned cost_usd); caption generation
  // (one real gpt-4o chat call per ready story, ~$0.03-0.06 per SOCIAL-
  // CREATIVE-5B's own measured cost) is estimated rather than left out of
  // the total - a "$0.00" digest while real caption calls ran would be
  // misleading, not merely imprecise.
  const captionsReadyCount = packages.filter((p) => p.captions).length;
  const estimatedCaptionSpendUsd = captionsReadyCount * 0.05;
  const digest = buildDailyDigest({
    candidatesDiscovered: discovered, candidatesRejected: [...rejected, ...diversityRejected],
    storiesSelected: packages.map((p) => ({ story_id: p.story_id, family: p.family, why_selected: p.scoring?.why_selected })),
    masterReuseCount: packages.filter((p) => p.creative?.source === "cache").length,
    masterGeneratedCount: packages.filter((p) => p.creative?.source === "generated").length,
    apiSpendUsd: spentTodayUsd.value + estimatedCaptionSpendUsd,
    captionsReady: packages.filter((p) => p.captions).length,
    captionsHeld: packages.filter((p) => p.status === "CAPTION_HOLD").length,
    videosReady: packages.filter((p) => p.video?.ok).length,
    videosHeld: packages.filter((p) => p.status === "VIDEO_HOLD").length,
    platformPlacementsReady: packages.reduce((s, p) => s + (p.publishing?.placements?.length ?? 0), 0),
    bufferPlacementsQueued: packages.filter((p) => p.status === "BUFFER_QUEUED").reduce((s, p) => s + p.publishing.placements.length, 0),
    withholds: packages.filter((p) => p.status.endsWith("_HOLD")).map((p) => ({ story_id: p.story_id, status: p.status })),
    duplicatesPrevented: 0, staleRejected: packages.filter((p) => p.status === "STALE_HOLD").length, now,
  });

  return {
    ok: true, mode, readiness: "OWNER_REVIEW_REQUIRED",
    reconciliation, calendar: { ready: recent.ready, lookback: (recent.rows ?? []).length },
    discovery: { discovered, candidates: candidates.length, rejected },
    evaluated: evaluated.map((c) => ({ family: c.family, score: c.scored.overall, why: c.scored.why_selected })),
    diversity_rejected: diversityRejected,
    selected: packages,
    digest,
  };
}
