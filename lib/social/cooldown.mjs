// Phase 13D.4 / 13E.1 - duplicate / content-fatigue control
// (docs/social-daily-workflow.md SS17). Deterministic cooldowns computed
// from an already-built payload plus a local post-history file. History
// records ONLY review-workflow facts: a key, when it was posted, and the
// content type - never a user, never a secret, never anything from a raw
// listing. The history file lives inside the gitignored
// `.social-preview/` tree and is never committed.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const HISTORY_PATH = path.join(process.cwd(), ".social-preview", "post-history.json");

// The cooldown windows from SS17. `deal` is Infinity: the exact same
// stored deal id is NEVER re-posted. Everything else is a rolling window
// in hours. `template` is intentionally a SOFT signal (see
// dailyMix.mjs) - the mix rotates composition where practical rather
// than hard-blocking on it.
export const COOLDOWN_WINDOW_HOURS = Object.freeze({
  deal: Infinity, // same deal: never repeat
  card: 14 * 24, // same canonical card: 14 days
  pokemon: 3 * 24, // same Pokemon: 3 days
  set: 7 * 24, // same set: 7 days
  template: 24, // same exact template composition: rotate within a day where practical
});

// The cooldown dimensions, computed from an already-built payload so a
// scheduler/reviewer never has to re-derive card/Pokemon/set identity.
export function buildCooldownKeys(payload) {
  const deal = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
  return {
    deal_cooldown_key: deal?.id != null ? `deal:${deal.id}` : null,
    card_cooldown_key: deal ? `card:${deal.card_name}|${deal.card_set}` : null,
    pokemon_cooldown_key:
      payload.content_type === "pokemon_spotlight" ? `pokemon:${payload.subject.display_name}` : null,
    set_cooldown_key:
      payload.content_type === "set_spotlight"
        ? `set:${payload.subject.display_name}`
        : deal?.card_set
          ? `set:${deal.card_set}`
          : null,
    template_cooldown_key: `template:${payload.template_family}`,
  };
}

// `history` is an array of { key, postedAt, contentType } entries. For an
// EMPTY history (a fresh install / first run) every candidate clears - a
// cooldown must never block local review just because nothing has ever
// been posted.
export function checkCooldowns(keys, history = [], windowHours = COOLDOWN_WINDOW_HOURS) {
  const now = Date.now();
  const onCooldown = (key, hours) => {
    if (!key) return false;
    if (hours === Infinity) return history.some((h) => h.key === key);
    return history.some((h) => h.key === key && now - Date.parse(h.postedAt) < hours * 3_600_000);
  };
  return {
    deal: onCooldown(keys.deal_cooldown_key, windowHours.deal),
    card: onCooldown(keys.card_cooldown_key, windowHours.card),
    pokemon: onCooldown(keys.pokemon_cooldown_key, windowHours.pokemon),
    set: onCooldown(keys.set_cooldown_key, windowHours.set),
    template: onCooldown(keys.template_cooldown_key, windowHours.template),
  };
}

// A candidate is BLOCKED by cooldown if any HARD dimension is cooling
// down. `template` is deliberately excluded here - it's a mix-rotation
// hint, not a hard block (SS17: "rotate where practical").
export function isBlockedByCooldown(cooldowns) {
  return Boolean(cooldowns.deal || cooldowns.card || cooldowns.pokemon || cooldowns.set);
}

export function firstBlockingReason(cooldowns) {
  if (cooldowns.deal) return "this exact deal has already been posted";
  if (cooldowns.card) return "this card was posted within the last 14 days";
  if (cooldowns.pokemon) return "this Pokemon was posted within the last 3 days";
  if (cooldowns.set) return "this set was posted within the last 7 days";
  return null;
}

// --- local history persistence (SS17) -----------------------------------

export function loadPostHistory() {
  try {
    if (!existsSync(HISTORY_PATH)) return [];
    const parsed = JSON.parse(readFileSync(HISTORY_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePostHistory(history) {
  mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf8");
}

export { HISTORY_PATH };
