// Phase SOCIAL-CAPTION-5B.1 SS2-SS4 - CAPTION ENTITY LOCK.
//
// Extracts factual named entities a caption mentions and validates them
// against the LOCKED identity the story snapshot/semantic manifest
// actually supports. Reuses the existing, comprehensive species list
// (lib/pokemonSpecies.js - already used by lib/social/newsroom/marketData.mjs
// for exactly this kind of species extraction) rather than building a
// second one. Generic domain language ("Pokemon cards", "collectors")
// never trips this - only a caption naming a SPECIFIC species/set/
// printing that is not the locked one does.

import { extractSpecies } from "../../pokemonSpecies.js";

export const CAPTION_ENTITY_LOCK_VERSION = "5b1.1";

// SS3 - a curated, deterministic (no DB lookup - this stays a pure,
// synchronous audit) list of well-known TCG set names, printing/variant
// terms, and rarity terms. Not exhaustive of every set ever printed;
// exhaustive enough to catch a caption inventing a DIFFERENT specific
// set/printing than the one locked, which is the failure mode this
// exists to catch (a caption inventing a KNOWN set name it wasn't given).
// An unrecognised proper noun is never flagged - only a recognised one
// that contradicts the lock.
const KNOWN_SETS = [
  "Base Set", "Jungle", "Fossil", "Team Rocket", "Gym Heroes", "Gym Challenge",
  "Neo Genesis", "Neo Discovery", "Neo Revelation", "Neo Destiny",
  "Legendary Collection", "Expedition", "Aquapolis", "Skyridge",
  "Ruby & Sapphire", "Sandstorm", "Dragon", "Team Magma vs Team Aqua",
  "Hidden Legends", "FireRed & LeafGreen", "Team Rocket Returns",
  "Deoxys", "Emerald", "Unseen Forces", "Delta Species", "Legend Maker",
  "Holon Phantoms", "Crystal Guardians", "Dragon Frontiers", "Power Keepers",
  "Diamond & Pearl", "Mysterious Treasures", "Secret Wonders", "Great Encounters",
  "Majestic Dawn", "Legends Awakened", "Stormfront", "Platinum", "Rising Rivals",
  "Supreme Victors", "Arceus", "HeartGold & SoulSilver", "Unleashed", "Undaunted",
  "Triumphant", "Call of Legends", "Black & White", "Emerging Powers",
  "Noble Victories", "Next Destinies", "Dark Explorers", "Dragons Exalted",
  "Boundaries Crossed", "Plasma Storm", "Plasma Freeze", "Plasma Blast",
  "Legendary Treasures", "XY", "Flashfire", "Furious Fists", "Phantom Forces",
  "Primal Clash", "Roaring Skies", "Ancient Origins", "BREAKthrough", "BREAKpoint",
  "Fates Collide", "Steam Siege", "Evolutions", "Sun & Moon", "Guardians Rising",
  "Burning Shadows", "Crimson Invasion", "Ultra Prism", "Forbidden Light",
  "Celestial Storm", "Lost Thunder", "Team Up", "Unbroken Bonds", "Unified Minds",
  "Cosmic Eclipse", "Sword & Shield", "Rebel Clash", "Darkness Ablaze",
  "Vivid Voltage", "Battle Styles", "Chilling Reign", "Evolving Skies",
  "Fusion Strike", "Brilliant Stars", "Astral Radiance", "Lost Origin",
  "Silver Tempest", "Scarlet & Violet", "Paldea Evolved", "Obsidian Flames",
  "151", "Paradox Rift", "Paldean Fates", "Temporal Forces",
];
const KNOWN_PRINTINGS = ["1st Edition", "First Edition", "Unlimited", "Shadowless"];
const KNOWN_VARIANTS = ["Reverse Holo", "Holo", "Non-Holo", "Full Art", "Alternate Art", "Rainbow Rare", "Gold Rare", "Promo"];

function findKnownMentions(text, list) {
  const s = String(text ?? "");
  const found = [];
  for (const name of list) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(s)) found.push(name);
  }
  return found;
}

// Every distinct Pokemon species the caption text mentions, found by
// repeatedly extracting + masking (extractSpecies only ever returns the
// single earliest match).
export function extractMentionedSpecies(text) {
  const found = new Set();
  let remaining = String(text ?? "");
  for (let i = 0; i < 20; i++) {
    const hit = extractSpecies(remaining);
    if (!hit) break;
    found.add(hit);
    const re = new RegExp(hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const next = remaining.replace(re, " ");
    if (next === remaining) break; // safety - avoid an infinite loop on a match masking can't remove
    remaining = next;
  }
  return [...found];
}

/**
 * buildLockedEntitySet(semanticManifest) -> the set of species/set/
 * printing/variant names a caption is ALLOWED to name specifically.
 * Reads ONLY the frozen manifest/card_metadata_lock - never re-queries
 * anything live.
 */
export function buildLockedEntitySet(semanticManifest = {}) {
  const S = semanticManifest || {};
  const species = new Set();
  const sets = new Set();
  const printings = new Set();
  const variants = new Set();

  for (const name of [S.card_identity?.name, S.example_card].filter(Boolean)) {
    const sp = extractSpecies(name);
    if (sp) species.add(sp);
  }
  // printing_compare's high/low pair, when present on the manifest.
  for (const side of [S.high, S.low]) {
    if (side?.name) { const sp = extractSpecies(side.name); if (sp) species.add(sp); }
  }

  const lock = S.card_metadata_lock;
  if (lock?._displayable?.includes("set") && lock.set) sets.add(String(lock.set));
  if (lock?._displayable?.includes("rarity") && lock.rarity) {
    for (const v of KNOWN_VARIANTS) if (String(lock.rarity).toLowerCase().includes(v.toLowerCase())) variants.add(v);
  }
  // shadowless / 1st edition / unlimited are frequently embedded directly
  // in the set string ("Base Set (Shadowless)") rather than a separate field.
  for (const source of [lock?.set, S.printing_lesson].filter(Boolean)) {
    for (const p of KNOWN_PRINTINGS) if (String(source).toLowerCase().includes(p.toLowerCase())) printings.add(p);
  }

  return { species, sets, printings, variants };
}

/**
 * auditCaptionEntityLock(text, semanticManifest) ->
 *   [{ code: "CAPTION_ENTITY_MISMATCH", detail }]
 */
export function auditCaptionEntityLock(text, semanticManifest = {}) {
  const locked = buildLockedEntitySet(semanticManifest);
  const findings = [];

  const mentionedSpecies = extractMentionedSpecies(text);
  for (const sp of mentionedSpecies) {
    if (locked.species.size === 0) {
      // no species is locked for this story at all - any specific,
      // recognised species named as a fact is unsupported.
      findings.push({ code: "CAPTION_ENTITY_MISMATCH", detail: `caption names "${sp}" but no example/card species is locked for this story` });
    } else if (!locked.species.has(sp)) {
      findings.push({ code: "CAPTION_ENTITY_MISMATCH", detail: `caption names "${sp}" but the locked example/card is ${[...locked.species].join(" / ")}` });
    }
  }

  const mentionedSets = findKnownMentions(text, KNOWN_SETS);
  for (const set of mentionedSets) {
    if (locked.sets.size && ![...locked.sets].some((s) => s.toLowerCase().includes(set.toLowerCase()))) {
      findings.push({ code: "CAPTION_ENTITY_MISMATCH", detail: `caption names set "${set}" but the locked set is ${[...locked.sets].join(" / ")}` });
    }
  }

  const mentionedPrintings = findKnownMentions(text, KNOWN_PRINTINGS);
  for (const p of mentionedPrintings) {
    if (locked.printings.size && !locked.printings.has(p)) {
      findings.push({ code: "CAPTION_ENTITY_MISMATCH", detail: `caption names printing "${p}" but the locked printing is ${[...locked.printings].join(" / ")}` });
    }
  }

  return findings;
}
