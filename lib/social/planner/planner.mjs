// Phase 13E.8A - THE CONTENT PLANNER (core).
//
//   real snapshot (social:source)  ->  candidates  ->  score / tier / diversity
//     ->  platform placements  ->  schedule into posting windows (cadence
//     ceilings + spacing + freshness safety)  ->  proposed plan
//
// PURE. It reads NOTHING: the caller passes the already-frozen snapshot
// and the local post-history array. No eBay call, no Buffer call, no
// render, no ledger mutation. If nothing qualifies it returns an empty
// plan cleanly (§21).

import { buildCreativeIdentifiers } from "../creativeSpec.mjs";
import { extractSpecies } from "../../pokemonSpecies.js";
import { SOCIAL_SPOTLIGHT_MIN_DEALS } from "../candidates.mjs";
import { SOCIAL_FRESHNESS_MAX_AGE_HOURS } from "../eligibility.mjs";
import {
  PLATFORM_ROLES,
  CADENCE_CEILING_PER_DAY,
  CAROUSEL_CEILING_PER_WEEK,
  BRAND_AD_CEILING_PER_WEEK,
  MIN_SPACING_MINUTES,
  POSTING_WINDOWS_UTC_HOURS,
  US_ET_OFFSET_HOURS,
  serviceOf,
} from "./platformRoles.mjs";
import { defaultGoalFor } from "./families.mjs";
import { scoreBreakdown } from "./scoring.mjs";
import { qualityTier, TIER_RANK } from "./tiers.mjs";
import { hardGuard, applyDiversity, diversityKeys } from "./diversity.mjs";
import { latestSafePublishAt, isPlannableAt } from "./freshness.mjs";
import { choosePlacements } from "./placements.mjs";
import { goalMixCheck, familyMixCheck } from "./contentMix.mjs";

const HRS = 3_600_000;
const MIN = 60_000;
const OWNER_TZ = "Australia/Brisbane"; // UTC+10, no DST

const brisFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: OWNER_TZ, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
});
function labelBrisbane(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${brisFmt.format(d)} Brisbane` : "(invalid)";
}
function labelUsEt(iso) {
  const d = new Date(Date.parse(iso) + US_ET_OFFSET_HOURS * HRS);
  if (!Number.isFinite(d.getTime())) return "(invalid)";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} US-ET`;
}

// --- candidate construction from a frozen snapshot -----------------

function contentIdFor(family, subject, generatedAt) {
  const CT = { deal_drop: "deal_of_day", market_mover: "market_mover", hook_carousel: "pokemon_spotlight", brand_ad: "brand_ad" };
  return buildCreativeIdentifiers({
    family,
    contentType: CT[family] ?? "deal_of_day",
    subject: subject || family,
    generatedAt: generatedAt || new Date().toISOString(),
    variant: "A",
  }).content_id;
}

// If a snapshot entry did not carry a freshness_state (e.g. a slim
// committed fixture), derive one from the freshness CONTRACT only:
// exact_verified_at within SOCIAL_FRESHNESS_MAX_AGE_HOURS of the frozen
// capture time -> FRESH, else null (not renderable). This mirrors
// social:source's own gate without depending on the row carrying every
// eligibility field.
function deriveFreshnessState(entry, r, captureMs) {
  if (entry.freshness_state != null) return entry.freshness_state;
  const iso = entry.exact_verified_at ?? r.exact_verified_at ?? null;
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const ageH = (captureMs - t) / 3_600_000;
  return ageH >= 0 && ageH <= SOCIAL_FRESHNESS_MAX_AGE_HOURS ? "FRESH" : null;
}

function dealCandidate(entry, generatedAt, captureMs) {
  const r = entry.row ?? entry;
  const species = extractSpecies(r.card_name ?? "") || String(r.card_name ?? "").split(" ")[0] || null;
  return {
    family: "deal_drop",
    goal: defaultGoalFor("deal_drop"),
    deal_id: r.id ?? null,
    card_name: r.card_name ?? null,
    card_set: r.card_set ?? null,
    species: species ? species.toLowerCase() : null,
    card_tcgplayer_id: r.card_tcgplayer_id ?? null,
    is_graded: Boolean(r.is_graded),
    discount_pct: r.discount_pct ?? null,
    market_price: r.market_price ?? null,
    total_price_usd: r.total_price_usd ?? null,
    exact_verified_at: entry.exact_verified_at ?? r.exact_verified_at ?? null,
    freshness_state: deriveFreshnessState(entry, r, captureMs),
    hook_variant: null,
    content_id: contentIdFor("deal_drop", r.card_name, generatedAt),
    source_ref: { type: "snapshot.deals", id: r.id ?? null, label: entry.label ?? null },
  };
}

function moverCandidate(entry, generatedAt) {
  const r = entry.row ?? entry;
  const species = extractSpecies(r.card_name ?? "") || String(r.card_name ?? "").split(" ")[0] || null;
  return {
    family: "market_mover",
    goal: defaultGoalFor("market_mover"),
    deal_id: r.id ?? null,
    card_name: r.card_name ?? null,
    card_set: r.card_set ?? null,
    species: species ? species.toLowerCase() : null,
    card_tcgplayer_id: r.card_tcgplayer_id ?? null,
    is_graded: Boolean(r.is_graded),
    discount_pct: r.discount_pct ?? null,
    market_price: r.market_price ?? null,
    total_price_usd: r.total_price_usd ?? null,
    exact_verified_at: entry.exact_verified_at ?? r.exact_verified_at ?? null,
    freshness_state: "MARKET_DATA",
    movement: entry.movement ?? null,
    confidence: entry.movement?.confidence ?? null,
    hook_variant: null,
    content_id: contentIdFor("market_mover", r.card_name, generatedAt),
    source_ref: { type: "snapshot.movers", id: r.id ?? null, label: entry.label ?? null },
  };
}

function carouselCandidate(carousel, generatedAt) {
  if (!carousel || !Array.isArray(carousel.deals) || carousel.deals.length < SOCIAL_SPOTLIGHT_MIN_DEALS) return null;
  const species = String(carousel.species ?? "").toLowerCase() || null;
  return {
    family: "hook_carousel",
    goal: defaultGoalFor("hook_carousel"),
    deal_id: null,
    card_name: null,
    card_set: carousel.deals[0]?.card_set ?? null,
    species,
    card_tcgplayer_id: carousel.deals[0]?.card_tcgplayer_id ?? null,
    discount_pct: null,
    market_price: null,
    total_price_usd: null,
    exact_verified_at: null,
    freshness_state: "FRESH",
    item_count: carousel.deals.length,
    hook_variant: null,
    content_id: contentIdFor("hook_carousel", species || "spotlight", generatedAt),
    source_ref: { type: "snapshot.carousel", id: species, label: `${carousel.deals.length} ${species} deals` },
  };
}

function brandAdCandidate(generatedAt) {
  return {
    family: "brand_ad",
    goal: defaultGoalFor("brand_ad"),
    deal_id: null,
    card_name: null, card_set: null, species: null, card_tcgplayer_id: null,
    discount_pct: null, market_price: null, total_price_usd: null,
    exact_verified_at: null, freshness_state: null,
    hook_variant: "how_it_works",
    content_id: contentIdFor("brand_ad", "how_it_works", generatedAt),
    source_ref: { type: "synthetic.brand_ad", id: "how_it_works", label: "how PokemonDealFinder works" },
  };
}

function subjectOf(cand) {
  if (cand.family === "hook_carousel") return `${cand.item_count} ${cand.species ?? "card"} deals`;
  if (cand.family === "brand_ad") return "How PokemonDealFinder works";
  return cand.card_name ?? cand.species ?? "(unknown)";
}

// --- horizon + slot grid -----------------------------------------

// Owner-timezone calendar-day boundaries as UTC ms, for `horizonDays` days
// starting from the day that contains `now`.
function ownerDayKeys(now, horizonDays, startOffsetDays = 0) {
  // Brisbane is UTC+10 with no DST -> a Brisbane calendar day is
  // [dayStartUtc, dayStartUtc+24h) where dayStartUtc = floor((now+10h)/24h)*24h - 10h.
  const OFFSET = 10 * HRS;
  const dayIndex = Math.floor((now + OFFSET) / (24 * HRS)) + startOffsetDays;
  const days = [];
  for (let i = 0; i < horizonDays; i++) {
    const startUtc = (dayIndex + i) * 24 * HRS - OFFSET;
    days.push({ startUtc, endUtc: startUtc + 24 * HRS });
  }
  return days;
}

// weekly bucket key (for the carousel / brand-ad weekly ceilings) - the
// ISO week the slot falls in, in UTC.
function weekKey(ms) {
  const d = new Date(ms);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${Math.floor((ms - jan1) / (7 * 24 * HRS))}`;
}

// build every posting slot in the horizon, per service. For each day
// (a Brisbane calendar day = a 24h UTC window) and each configured UTC
// hour, there is exactly one instant in the window with that UTC hour.
function buildSlots(days, { now = Date.now() } = {}) {
  const slots = []; // { service, iso, ms, dayStartUtc }
  for (const day of days) {
    for (const [service, hours] of Object.entries(POSTING_WINDOWS_UTC_HOURS)) {
      for (const h of hours) {
        let ms = null;
        for (let k = 0; k < 24; k++) {
          const t = day.startUtc + k * HRS;
          if (new Date(t).getUTCHours() === h) { ms = t; break; }
        }
        if (ms == null || ms < now) continue; // never schedule in the past
        slots.push({ service, iso: new Date(ms).toISOString(), ms, dayStartUtc: day.startUtc });
      }
    }
  }
  slots.sort((a, b) => a.ms - b.ms || a.service.localeCompare(b.service));
  return slots;
}

// --- the plan ---------------------------------------------------

export function buildPlan({
  snapshot,
  history = [],
  horizon = "today", // "today" | "tomorrow" | "week"
  now = Date.now(),
  simulate = false,
} = {}) {
  const generatedAt = snapshot?.captured_at ?? new Date(now).toISOString();
  const captureMs = Date.parse(generatedAt) || now;
  // In a SIMULATION we plan relative to the snapshot's own capture time
  // (so a fixture's deal freshness windows are still meaningful); a real
  // run plans relative to wall-clock now.
  const planNow = simulate ? captureMs : now;

  const empty = !snapshot || snapshot.empty || (!snapshot.deals?.length && !snapshot.movers?.length && !snapshot.carousel);

  // horizon -> days
  const horizonDays = horizon === "week" ? 7 : 1;
  const startOffset = horizon === "tomorrow" ? 1 : 0;
  const days = ownerDayKeys(planNow, horizonDays, startOffset);
  const horizonStartUtc = new Date(days[0].startUtc).toISOString();
  const horizonEndUtc = new Date(days[days.length - 1].endUtc).toISOString();

  const base = {
    horizon, simulate, generated_at: new Date(now).toISOString(),
    snapshot_source: snapshot?.source ?? null, snapshot_captured_at: snapshot?.captured_at ?? null,
    horizon_start_utc: horizonStartUtc, horizon_end_utc: horizonEndUtc,
    entries: [], not_scheduled: [], unfilled: [], mix: null, warnings: [],
  };

  if (empty) {
    return { ...base, empty: true, reason: snapshot?.empty_reason ?? "no snapshot / no candidate content" };
  }

  // 1. candidates
  const candidates = [];
  for (const d of snapshot.deals ?? []) candidates.push(dealCandidate(d, generatedAt, captureMs));
  for (const m of snapshot.movers ?? []) candidates.push(moverCandidate(m, generatedAt));
  const carousel = carouselCandidate(snapshot.carousel, generatedAt);
  if (carousel) candidates.push(carousel);
  candidates.push(brandAdCandidate(generatedAt)); // always available, heavily capped

  // 2. score / tier / diversity / hard guard
  const scored = [];
  const notScheduled = [];
  for (const c of candidates) {
    const guard = hardGuard(c, history, captureMs);
    if (guard.blocked) {
      notScheduled.push({ content_id: c.content_id, family: c.family, subject: subjectOf(c), reason: `hard cooldown: ${guard.reason}` });
      continue;
    }
    const bd = scoreBreakdown(c, { now: captureMs, roles: PLATFORM_ROLES });
    const div = applyDiversity(c, bd.raw, history, captureMs);
    const tier = qualityTier(c);
    const safe = latestSafePublishAt(c, { now: captureMs });
    const rec = {
      cand: c, tier, raw: bd.raw, adjusted: div.adjusted, breakdown: bd, diversity: div,
      fresh_until_utc: safe.at, latest_safe_basis: safe.basis,
    };
    if (tier === "NOT_SOCIAL") {
      notScheduled.push({ content_id: c.content_id, family: c.family, subject: subjectOf(c), quality_tier: tier, score: div.adjusted, reason: "NOT_SOCIAL — a valid site deal but a weak social candidate (creative suitability only)" });
      continue;
    }
    scored.push(rec);
  }

  // 2b. one candidate per content_id - two listings of the SAME card
  // (same buildCreativeIdentifiers subject) collapse to a single post;
  // keep the higher-scoring one.
  const byContent = new Map();
  for (const rec of scored) {
    const prev = byContent.get(rec.cand.content_id);
    if (!prev || rec.adjusted > prev.adjusted) byContent.set(rec.cand.content_id, rec);
  }
  const dedupedScored = [...byContent.values()];

  // 3. explode into per-placement candidates
  const placementCands = [];
  for (const rec of dedupedScored) {
    const c = { ...rec.cand, quality_tier: rec.tier };
    const places = choosePlacements(c);
    if (!places.length) {
      notScheduled.push({ content_id: c.content_id, family: c.family, subject: subjectOf(c), quality_tier: rec.tier, score: rec.adjusted, reason: "no eligible platform placement for this family/tier" });
      continue;
    }
    for (const p of places) {
      placementCands.push({ ...rec, placement: p, service: p.service, platform: p.platform });
    }
  }

  // 4. rank: adjusted score desc, then tier, then a stable id tie-break
  placementCands.sort(
    (a, b) =>
      b.adjusted - a.adjusted ||
      TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
      String(a.cand.content_id).localeCompare(String(b.cand.content_id)) ||
      String(a.platform).localeCompare(String(b.platform))
  );

  // 5. schedule into slots
  const slots = buildSlots(days, { now: planNow });
  const usedSlots = new Set(); // `${service}|${iso}` - two platforms CAN post at the same clock time
  const perServicePerDay = new Map(); // `${service}|${dayStartUtc}` -> count
  const serviceTimes = new Map(); // service -> [ms...]  (spacing check)
  const weekBucket = new Map(); // `${kind}|${weekKey}` -> count
  const placedPair = new Set(); // `${content_id}|${platform}` (same-platform duplicate block)
  const entries = [];

  const spacingOk = (service, ms) => {
    const gap = (MIN_SPACING_MINUTES[service] ?? 120) * MIN;
    return (serviceTimes.get(service) ?? []).every((t) => Math.abs(t - ms) >= gap);
  };

  for (const pc of placementCands) {
    const c = pc.cand;
    const service = pc.service;
    const pairKey = `${c.content_id}|${pc.platform}`;
    if (placedPair.has(pairKey)) continue; // never the same content on the same platform twice

    let placed = null;
    let sawFreshFail = false;
    for (const slot of slots) {
      if (slot.service !== service) continue;
      if (usedSlots.has(`${service}|${slot.iso}`)) continue;
      const dayKey = `${service}|${slot.dayStartUtc}`;
      if ((perServicePerDay.get(dayKey) ?? 0) >= (CADENCE_CEILING_PER_DAY[service] ?? 1)) continue;
      if (!spacingOk(service, slot.ms)) continue;
      // weekly ceilings
      if (c.family === "hook_carousel" && (weekBucket.get(`carousel|${weekKey(slot.ms)}`) ?? 0) >= CAROUSEL_CEILING_PER_WEEK) continue;
      if (c.family === "brand_ad" && (weekBucket.get(`brand|${weekKey(slot.ms)}`) ?? 0) >= BRAND_AD_CEILING_PER_WEEK) continue;
      // freshness safety (§15)
      if (!isPlannableAt(c, slot.iso, { now: captureMs })) { sawFreshFail = true; continue; }
      placed = slot;
      break;
    }

    if (!placed) {
      const reason =
        sawFreshFail && (c.family === "deal_drop" || c.family === "hook_carousel")
          ? `freshness: no slot in the ${horizon} horizon is inside latest_safe_publish_at (${pc.fresh_until_utc})`
          : `no free ${service} slot (cadence ceiling ${CADENCE_CEILING_PER_DAY[service]}/day, spacing ${MIN_SPACING_MINUTES[service]}m)`;
      notScheduled.push({ content_id: c.content_id, family: c.family, platform: pc.platform, subject: subjectOf(c), quality_tier: pc.tier, score: pc.adjusted, reason });
      continue;
    }

    usedSlots.add(`${service}|${placed.iso}`);
    perServicePerDay.set(`${service}|${placed.dayStartUtc}`, (perServicePerDay.get(`${service}|${placed.dayStartUtc}`) ?? 0) + 1);
    serviceTimes.set(service, [...(serviceTimes.get(service) ?? []), placed.ms]);
    if (c.family === "hook_carousel") weekBucket.set(`carousel|${weekKey(placed.ms)}`, (weekBucket.get(`carousel|${weekKey(placed.ms)}`) ?? 0) + 1);
    if (c.family === "brand_ad") weekBucket.set(`brand|${weekKey(placed.ms)}`, (weekBucket.get(`brand|${weekKey(placed.ms)}`) ?? 0) + 1);
    placedPair.add(pairKey);

    const whyBits = [`tier ${pc.tier}`, `score ${pc.adjusted}`];
    const topComp = Object.entries(pc.breakdown.weighted).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
    whyBits.push(`driven by ${topComp.join(" + ")}`);
    if (pc.diversity.overridden) whyBits.push("exceptional — overrode soft diversity penalty");
    else if (pc.diversity.penaltyApplied > 0) whyBits.push(`-${pc.diversity.penaltyApplied} recent-repetition penalty`);

    entries.push({
      plan_id: `plan_${c.content_id}_${pc.platform}_${placed.ms.toString(36)}`,
      state: "PROPOSED",
      time_utc: placed.iso,
      time_brisbane: labelBrisbane(placed.iso),
      time_us_et: labelUsEt(placed.iso),
      service,
      platform: pc.platform,
      placement: pc.placement.placement_media_kind,
      content_id: c.content_id,
      family: c.family,
      goal: pc.placement.goal,
      subject: subjectOf(c),
      quality_tier: pc.tier,
      score: pc.adjusted,
      score_raw: pc.raw,
      score_breakdown: pc.breakdown.weighted,
      diversity: pc.diversity.byDimension,
      why: whyBits.join("; "),
      fresh_until_utc: pc.fresh_until_utc,
      latest_safe_basis: pc.latest_safe_basis,
      source_ref: c.source_ref,
      simulate,
    });
  }

  entries.sort((a, b) => Date.parse(a.time_utc) - Date.parse(b.time_utc) || a.platform.localeCompare(b.platform));

  // 6. unfilled slots (NO artificial filling - just report them) (§20)
  const unfilled = slots
    .filter((s) => !usedSlots.has(`${s.service}|${s.iso}`))
    .map((s) => ({ time_utc: s.iso, time_brisbane: labelBrisbane(s.iso), service: s.service, reason: "no qualifying content" }));

  // 7. mix + warnings
  const goalCounts = {};
  const familyCounts = {};
  for (const e of entries) {
    goalCounts[e.goal] = (goalCounts[e.goal] ?? 0) + 1;
    familyCounts[e.family] = (familyCounts[e.family] ?? 0) + 1;
  }
  const mix = { goal: goalMixCheck(goalCounts, entries.length), family: familyMixCheck(familyCounts, entries.length) };

  const warnings = [];
  // count DISTINCT content items per species/set (one post on 4 platforms
  // is one subject, not four).
  const speciesItems = {};
  const setItems = {};
  for (const rec of dedupedScored) {
    const inPlan = entries.some((e) => e.content_id === rec.cand.content_id);
    if (!inPlan) continue;
    if (rec.cand.species) (speciesItems[rec.cand.species] ??= new Set()).add(rec.cand.content_id);
    if (rec.cand.card_set) (setItems[rec.cand.card_set] ??= new Set()).add(rec.cand.content_id);
  }
  for (const [sp, ids] of Object.entries(speciesItems)) {
    if (ids.size >= 3) warnings.push(`${sp} is the subject of ${ids.size} distinct planned posts — vary the Pokemon`);
  }
  for (const [st, ids] of Object.entries(setItems)) {
    if (ids.size >= 4) warnings.push(`${st} is the set of ${ids.size} distinct planned posts — vary the set`);
  }
  for (const [g, v] of Object.entries(mix.goal.byKey)) {
    if (v.status === "over") warnings.push(`goal mix: ${g} is ${(v.share * 100).toFixed(0)}% of the plan (target ${(v.target[0] * 100).toFixed(0)}-${(v.target[1] * 100).toFixed(0)}%)`);
  }
  if (entries.length === 0) warnings.push("no placements scheduled — every candidate was NOT_SOCIAL, on cooldown, stale, or capped");

  // simulation diagnostics: a stale committed fixture exercises the
  // freshness gate but leaves no deal-drop runway - flag it so the
  // family-balance read is interpreted correctly (§22).
  const dealCandCount = candidates.filter((c) => c.family === "deal_drop").length;
  const dealEntryCount = entries.filter((e) => e.family === "deal_drop").length;
  if (simulate && dealCandCount > 0 && dealEntryCount === 0) {
    warnings.push(
      `deal freshness expiry: all ${dealCandCount} deal-drop candidate(s) were past latest_safe_publish_at before the first posting window. ` +
      `The committed fixture was frozen well after verification, so it exercises the freshness gate (§15) but not deal-drop scheduling. ` +
      `A fresh 'social:source -- live' snapshot would carry several hours of runway and the family mix would rebalance toward Deal Drops.`
    );
  }

  return { ...base, empty: false, entries, not_scheduled: notScheduled, unfilled, mix, warnings };
}
