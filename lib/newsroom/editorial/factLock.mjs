// Phase SOCIAL-CREATIVE-4A - FACT_LOCK (§7).
//
// The AI creative director receives factual fields as IMMUTABLE context.
// This module:
//   * buildFactLock()   - extract ONLY the whitelisted factual fields from
//                         a resolved story, normalise them, freeze them.
//   * factLockHash()    - a stable content hash of the locked values, used
//                         in the version stamp (§34) and QA rows.
//   * detectFactMutation() - after the AI returns creative direction,
//                         compare every factual field it echoes against the
//                         lock. ANY mismatch -> AI_FACT_MUTATION.
//
// Deterministic. No I/O, no network, no OpenAI. The AI never runs here -
// this is the gate the AI's output must pass.

import { createHash } from "node:crypto";
import { failure } from "./failureStates.mjs";

// §7 - the exact fields that must never change once locked. Anything the
// AI emits under one of these keys is compared byte-for-byte (after
// normalisation) with the locked value.
export const FACT_LOCK_FIELDS = Object.freeze([
  "card_name",
  "card_set",
  "card_number",
  "card_tcgplayer_id",
  "printing", // 1st Edition / Unlimited / Shadowless / Reverse Holo / ...
  "variant",
  "listed_price",
  "market_price",
  "sold_price",
  "shipping",
  "discount_pct",
  "auction_end",
  "bid_count",
  "grade",
  "currency",
  "sample_size",
  "tracked_count",
  "percentages", // array or map of any % figures shown
  "url",
  "content_id",
  "ids", // any other id array/map (deal ids, placement id)
]);

const MONEY_FIELDS = new Set(["listed_price", "market_price", "sold_price", "shipping"]);
const INT_FIELDS = new Set(["bid_count", "sample_size", "tracked_count"]);

function normaliseValue(field, v) {
  if (v == null) return null;
  if (MONEY_FIELDS.has(field)) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  if (INT_FIELDS.has(field)) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (field === "discount_pct") {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    // accept 0..1 or 0..100; store as an integer percent
    return n <= 1 ? Math.round(n * 100) : Math.round(n);
  }
  if (field === "percentages") {
    if (Array.isArray(v)) return v.map((x) => normaliseValue("discount_pct", x)).filter((x) => x != null);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normaliseValue("discount_pct", x)]));
    }
    return null;
  }
  if (field === "ids" || field === "percentages") return v;
  if (Array.isArray(v)) return v.map((x) => (x == null ? null : String(x).trim()));
  if (typeof v === "object") return v;
  // strings: trim + collapse whitespace; card_number strips a set prefix + leading zeros
  let s = String(v).trim().replace(/\s+/g, " ");
  if (field === "card_number") s = s.replace(/^[A-Za-z]+[-\s]?/, "").replace(/^0+(?=\d)/, "");
  return s;
}

// source can be a flat object or a resolved-story shape with nested
// `facts_json` / `data` / `card`. We look in a few known places per field.
function pluck(source, field) {
  if (source == null) return undefined;
  const roots = [source, source.facts_json, source.facts, source.data, source.card, source.deal].filter(Boolean);
  const aliases = {
    listed_price: ["listed_price", "total_price_usd", "asking_usd", "price_usd", "priceUsd"],
    market_price: ["market_price", "market_ref_usd", "marketUsd", "market_usd"],
    sold_price: ["sold_price", "sold_usd", "recent_sold_usd"],
    card_tcgplayer_id: ["card_tcgplayer_id", "tcgplayerId", "tcgplayer_id"],
    card_name: ["card_name", "name"],
    card_set: ["card_set", "set"],
    card_number: ["card_number", "number", "card_no"],
    discount_pct: ["discount_pct", "gap_pct", "saved_pct"],
    auction_end: ["auction_end", "auction_end_at", "auctionEndAt"],
    bid_count: ["bid_count", "bids", "bidCount"],
    content_id: ["content_id", "contentId"],
  };
  const keys = aliases[field] ?? [field];
  for (const root of roots) {
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(root, k) && root[k] != null) return root[k];
    }
  }
  return undefined;
}

// Build the immutable lock. Only whitelisted fields that are actually
// present are locked; `_present` lists them.
export function buildFactLock(source) {
  const locked = {};
  const present = [];
  for (const field of FACT_LOCK_FIELDS) {
    const raw = pluck(source, field);
    if (raw === undefined) continue;
    const norm = normaliseValue(field, raw);
    if (norm === null || norm === "" || (Array.isArray(norm) && norm.length === 0)) continue;
    locked[field] = norm;
    present.push(field);
  }
  return Object.freeze({ ...deepFreeze(locked), _present: Object.freeze(present) });
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

function canonical(lock) {
  const body = {};
  for (const k of Object.keys(lock).filter((k) => k !== "_present").sort()) body[k] = lock[k];
  return JSON.stringify(body);
}

// Stable hash of the locked values (not the field list). 16 hex chars +
// the full digest.
export function factLockHash(lock) {
  const full = createHash("sha256").update(canonical(lock)).digest("hex");
  return { short: full.slice(0, 16), full };
}

function eq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && eq(a[k], b[k]));
  }
  return String(a) === String(b);
}

// Walk an arbitrary AI-output object; for every key that ALSO exists in
// the lock, the value must match the locked (normalised) value. Returns
// { ok, mutations: [{ field, locked, got, path }] }. `state` is
// AI_FACT_MUTATION when not ok.
export function detectFactMutation(lock, aiOutput, { stage = "creative_director" } = {}) {
  const mutations = [];
  const lockedKeys = new Set(Object.keys(lock).filter((k) => k !== "_present"));

  const walk = (node, path) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      if (lockedKeys.has(k)) {
        const norm = normaliseValue(k, v);
        if (!eq(norm, lock[k])) {
          mutations.push({ field: k, locked: lock[k], got: norm ?? v, path: p });
        }
      }
      walk(v, p);
    }
  };
  walk(aiOutput, "");

  if (mutations.length) {
    return {
      ok: false,
      ...failure("AI_FACT_MUTATION", `AI output changed ${mutations.length} locked field(s): ${mutations.map((m) => `${m.field} ${JSON.stringify(m.locked)}->${JSON.stringify(m.got)}`).join("; ")}`, { stage, detail: { mutations } }),
      mutations,
    };
  }
  return { ok: true, state: null, mutations: [] };
}
