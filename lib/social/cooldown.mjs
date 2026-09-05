// Phase 13D.4 - the cooldown DATA MODEL only (docs/social-creative-system.md
// SS18). No posting history is persisted anywhere yet - there is nothing
// to be on cooldown FROM, since nothing has ever been posted. This module
// exists so a future persistence layer has an agreed shape to write
// against; `checkCooldowns` is fully deterministic and, given an empty
// history (the only history that currently exists), always clears every
// candidate - it must never block local preview testing for that reason.

// The four cooldown dimensions from the design doc, computed from an
// already-built payload so a future scheduler could look them up without
// re-deriving card/Pokemon/set identity itself.
export function buildCooldownKeys(payload) {
  const deal = Array.isArray(payload.deal_data) ? payload.deal_data[0] : payload.deal_data;
  return {
    card_cooldown_key: deal ? `card:${deal.card_name}|${deal.card_set}` : null,
    pokemon_cooldown_key: payload.content_type === "pokemon_spotlight" ? `pokemon:${payload.subject.display_name}` : null,
    set_cooldown_key: payload.content_type === "set_spotlight" ? `set:${payload.subject.display_name}` : deal?.card_set ? `set:${deal.card_set}` : null,
    template_cooldown_key: `template:${payload.template_family}`,
  };
}

// `history` is an array of { key, postedAt } entries a future persistence
// layer would supply - always [] today. `windowsHours` lets a caller
// express "same card not within 72h" etc. without this module hardcoding
// a specific business rule (that belongs to a future scheduler, not this
// spike). Returns which of the four keys are currently cooling down.
export function checkCooldowns(keys, history = [], windowHours = { card: 72, pokemon: 24, set: 24, template: 12 }) {
  const now = Date.now();
  const onCooldown = (key, hours) => {
    if (!key) return false;
    return history.some((h) => h.key === key && now - Date.parse(h.postedAt) < hours * 3_600_000);
  };
  return {
    card: onCooldown(keys.card_cooldown_key, windowHours.card),
    pokemon: onCooldown(keys.pokemon_cooldown_key, windowHours.pokemon),
    set: onCooldown(keys.set_cooldown_key, windowHours.set),
    template: onCooldown(keys.template_cooldown_key, windowHours.template),
  };
}
