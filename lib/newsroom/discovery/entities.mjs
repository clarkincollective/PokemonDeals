// Phase SOCIAL-DISCOVERY-1 SS1/SS3 - ENTITY EXTRACTION.
//
// Every entity a discovery manifest is allowed to mention comes from the
// FROZEN pkg.snapshot / pkg.semantic_manifest - never re-queried, never
// invented. This is the single source every keyword/hashtag/route module
// reads from, so a Clefairy story structurally cannot mention Charizard.

/**
 * extractLockedEntities(pkg) -> { pokemon: Set, cards: Set, sets: Set,
 *   printings: Set, variants: Set, cardIds: number[] }
 *
 * "pokemon" holds species names; "cards" holds full card names (which may
 * differ from species for some catalog rows, e.g. "Charizard ex").
 */
export function extractLockedEntities(pkg) {
  const snap = pkg?.snapshot ?? {};
  const sem = pkg?.semantic_manifest ?? {};
  const pokemon = new Set();
  const cards = new Set();
  const sets = new Set();
  const printings = new Set();
  const variants = new Set();

  const addCard = (name, set) => {
    if (name) { cards.add(String(name).trim()); pokemon.add(String(name).trim().split(/\s+/)[0]); }
    if (set) sets.add(String(set).trim());
  };

  // canonical_card_metadata is keyed by tcgplayer_id -> {name, set, ...}
  // (SOCIAL-CAPTION-5B.1 fixed shape) for every single-card family.
  const meta = snap.canonical_card_metadata && typeof snap.canonical_card_metadata === "object" ? Object.values(snap.canonical_card_metadata) : [];
  for (const m of meta) addCard(m?.name, m?.set);

  // printing_compare / asking_vs_sold pairs carry high/low or A/B identity.
  if (sem.card_identity?.name) addCard(sem.card_identity.name, sem.card_identity.set);
  if (sem.example_card) { cards.add(String(sem.example_card).trim()); pokemon.add(String(sem.example_card).trim().split(/\s+/)[0]); }
  if (sem.printing_identity_a?.name) addCard(sem.printing_identity_a.name, sem.printing_identity_a.set);
  if (sem.printing_identity_b?.name) addCard(sem.printing_identity_b.name, sem.printing_identity_b.set);

  const lock = sem.card_metadata_lock ?? {};
  if (lock.name) addCard(lock.name, lock.set);
  if (lock.printing) printings.add(String(lock.printing).trim());
  if (lock.edition) printings.add(String(lock.edition).trim());
  if (lock.variant) variants.add(String(lock.variant).trim());
  if (lock.rarity) variants.add(String(lock.rarity).trim());

  return {
    pokemon, cards, sets, printings, variants,
    cardIds: Array.isArray(snap.canonical_card_ids) ? snap.canonical_card_ids : [],
  };
}

// Convenience flat arrays, sorted for deterministic output.
export function entityArrays(pkg) {
  const e = extractLockedEntities(pkg);
  return {
    pokemon_entities: [...e.pokemon].sort(),
    card_entities: [...e.cards].sort(),
    set_entities: [...e.sets].sort(),
    printing_entities: [...e.printings, ...e.variants].sort(),
  };
}
