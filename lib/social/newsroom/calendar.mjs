// Phase SOCIAL-NEWSROOM-1 - EDITORIAL CALENDAR BUILDER (§9,§11,§13,§33,§49).
//
// Given ranked candidate STORIES (with native placements + scores) and a
// horizon, lay them into a per-platform calendar of daily slots:
//
//   FIXED_EDITORIAL_SLOT  - filled by a planned editorial story
//   RESERVED_FRESH_SLOT   - held for the FRESH lane (Deal Drops etc);
//                           left OPEN here on purpose (§33)
//   OPEN_SLOT             - editorial capacity with no qualifying story
//
// Deterministic. Honours editorial capacity per day (backlogHealth), the
// anti-AI-spam sequence gate, the weekly editorial balance bands, and
// shelf-life expiry. Leaving slots unfilled is acceptable and expected -
// the goal is high-quality variety, not zero gaps (§49).
//
// Pure. No I/O, no render, no Buffer.

import { editorialCapacityPerDay, freshReservePerDay } from "./backlogHealth.mjs";
import { checkSequence } from "./sequenceGate.mjs";
import { balanceCheck } from "./pillars.mjs";
import { storyPublishableAt } from "./story.mjs";
import { originalityKeys } from "./originalityScore.mjs";

const DAY = 86_400_000;
const PLATFORMS = ["instagram", "tiktok", "x", "youtube"];

// one editorial posting time per index within a day (UTC hours), spread so
// same-day items are not stacked. Mirrors the planner's window spirit
// without importing its full slot grid.
const DAY_SLOT_HOURS = [17, 0, 21, 13];

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// candidates: [{ story, placements:[{platform,...}], organic_score,
//   conversion_score, originality_score, exceptional? }]
// Returns a per-platform calendar + diagnostics.
export function buildEditorialCalendar(candidates = [], { horizonDays = 14, now = Date.now() } = {}) {
  const startDay = now - (now % DAY) + DAY; // begin tomorrow (UTC)
  const calendar = {};
  const diagnostics = { platform: {}, balance: null, sequence: {}, unfilled: [] };

  // rank once: exceptional first, then organic, then originality, then a
  // stable id tie-break.
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(b.exceptional || 0) - Number(a.exceptional || 0) ||
      (b.organic_score ?? 0) - (a.organic_score ?? 0) ||
      (b.originality_score ?? 0) - (a.originality_score ?? 0) ||
      String(a.story.story_id).localeCompare(String(b.story.story_id))
  );

  const placedByBucket = {};
  let placedTotal = 0;

  for (const platform of PLATFORMS) {
    const capPerDay = editorialCapacityPerDay(platform);
    const reservedPerDay = freshReservePerDay(platform);
    const perDayPlaced = new Map(); // dayKey -> count
    const sequenceItems = []; // ordered, for the sequence gate
    const slots = [];

    // build the slot skeleton first
    for (let d = 0; d < horizonDays; d++) {
      const base = startDay + d * DAY;
      for (let k = 0; k < capPerDay; k++) {
        const hour = DAY_SLOT_HOURS[k % DAY_SLOT_HOURS.length];
        slots.push({ type: "OPEN_SLOT", platform, day: dayKey(base), time_utc: new Date(base + hour * 3600_000).toISOString(), story_id: null, series: null, placement_id: null });
      }
      for (let r = 0; r < reservedPerDay; r++) {
        const hour = DAY_SLOT_HOURS[(capPerDay + r) % DAY_SLOT_HOURS.length];
        slots.push({ type: "RESERVED_FRESH_SLOT", platform, day: dayKey(base), time_utc: new Date(base + hour * 3600_000).toISOString(), story_id: null, series: null, placement_id: null });
      }
    }
    slots.sort((a, b) => Date.parse(a.time_utc) - Date.parse(b.time_utc));

    // fill FIXED_EDITORIAL_SLOTs greedily from the ranked list
    for (const cand of ranked) {
      const plc = cand.placements.find((p) => p.platform === platform);
      if (!plc) continue;
      if (cand.story.lane === "FRESH") continue; // fresh lane fills reserved slots at runtime, not here
      // find the earliest OPEN editorial slot the story is still fresh for
      // and that keeps the sequence clean.
      let target = null;
      for (const slot of slots) {
        if (slot.type !== "OPEN_SLOT" || slot.story_id) continue;
        if ((perDayPlaced.get(slot.day) ?? 0) >= capPerDay) continue;
        if (!storyPublishableAt(cand.story, slot.time_utc)) continue;
        // sequenceItems is already in ascending time order (slots are
        // time-sorted and filled earliest-first), so appending is correct.
        const trial = [...sequenceItems, { id: cand.story.story_id, keys: originalityKeys(cand.story), exceptional: cand.exceptional }];
        if (checkSequence(trial).violations.length > 0 && !cand.exceptional) continue;
        target = slot;
        break;
      }
      if (!target) continue;
      target.type = "FIXED_EDITORIAL_SLOT";
      target.story_id = cand.story.story_id;
      target.series = cand.story.series;
      target.pillar = cand.story.pillar;
      target.bucket = cand.story.bucket;
      target.placement_id = plc.placement_id;
      target.organic_score = cand.organic_score ?? null;
      target.conversion_score = cand.conversion_score ?? null;
      perDayPlaced.set(target.day, (perDayPlaced.get(target.day) ?? 0) + 1);
      sequenceItems.push({ id: cand.story.story_id, keys: originalityKeys(cand.story), exceptional: cand.exceptional });
      placedByBucket[cand.story.bucket] = (placedByBucket[cand.story.bucket] ?? 0) + 1;
      placedTotal++;
    }

    calendar[platform] = slots;
    const filled = slots.filter((s) => s.type === "FIXED_EDITORIAL_SLOT").length;
    const open = slots.filter((s) => s.type === "OPEN_SLOT").length;
    const reserved = slots.filter((s) => s.type === "RESERVED_FRESH_SLOT").length;
    diagnostics.platform[platform] = {
      editorial_capacity_per_day: capPerDay,
      reserved_fresh_per_day: reservedPerDay,
      fixed_editorial: filled,
      reserved_fresh: reserved,
      open: open,
      days_covered: Number((filled / capPerDay).toFixed(1)),
    };
    diagnostics.sequence[platform] = checkSequence(sequenceItems);
    for (const s of slots) if (s.type === "OPEN_SLOT") diagnostics.unfilled.push({ platform, time_utc: s.time_utc, reason: "no qualifying editorial story" });
  }

  diagnostics.balance = balanceCheck(placedByBucket, placedTotal);
  diagnostics.placed_total = placedTotal;
  return { calendar, diagnostics };
}
