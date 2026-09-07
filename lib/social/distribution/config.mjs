// Phase 13E.5A - SOCIAL DISTRIBUTION CONFIG + SAFETY FLAGS.
//
// The distribution layer is NON-PUBLISHING by default. Turning it on
// requires SEVERAL independent, explicit signals to all line up at once
// (see lib/social/distribution/gates.mjs). This module only READS those
// signals from the environment - it never writes config, never flips a
// flag, and holds no credential.
//
// All timestamps in the ledger and every provider payload are UTC ISO
// strings. `brisbaneLabel()` is display-only sugar for a human reviewer
// (the owner is in Australia/Brisbane, UTC+10, no DST).

// --- explicit safety flags (every one defaults to the SAFE value) ------
//
//   SOCIAL_PUBLISH_ENABLED     "true"  -> the master publish switch is ON
//                              anything else / unset -> OFF  (default)
//   SOCIAL_PUBLISH_DRY_RUN     "false" -> real provider calls are permitted
//                              anything else / unset -> DRY RUN  (default)
//   SOCIAL_EPN_AI_CLASSIFICATION  the owner/compliance classification of
//     THIS pipeline's GenAI use against EPN's "AI Tools" policy. This is an
//     INTERNAL owner decision - it does NOT represent, imply, or claim any
//     formal approval from eBay / EPN. Accepted values:
//       NOT_APPLICABLE_CURRENT_PIPELINE
//         the current pipeline sends NO eBay data to a GenAI model:
//         OpenAI receives only DATA-FREE background-generation
//         instructions (family/style/zone enums - see
//         lib/social/assetPrompts.mjs); it never receives eBay listing
//         data, prices, seller data, seller images, affiliate data, or
//         customer data. Real card artwork + all factual overlays are
//         composited DETERMINISTICALLY after generation. The promoted
//         destination is PokemonDealFinder.com, not eBay directly.
//         (recorded in docs/social-compliance-readiness.md SS4a)
//       APPROVED
//         a formal EPN AI Tools approval has actually been granted + filed.
//       "" / anything else -> UNCLASSIFIED -> the gate blocks.
//
// NOTE: rights.mjs RIGHTS_STATE.publishing is a SEPARATE, code-reviewed
// gate ("DISABLED" today). BOTH it and SOCIAL_PUBLISH_ENABLED must say go.
export const EPN_AI_CLASSIFICATIONS = Object.freeze(["NOT_APPLICABLE_CURRENT_PIPELINE", "APPROVED"]);

export function readDistributionFlags(env = process.env) {
  const truthy = (v) => String(v ?? "").trim().toLowerCase() === "true";
  const falsy = (v) => String(v ?? "").trim().toLowerCase() === "false";
  const cls = String(env.SOCIAL_EPN_AI_CLASSIFICATION ?? "").trim().toUpperCase();
  return {
    publishEnabled: truthy(env.SOCIAL_PUBLISH_ENABLED),
    // dry-run is ON unless someone EXPLICITLY sets it to the string "false"
    dryRun: !falsy(env.SOCIAL_PUBLISH_DRY_RUN),
    // the owner/compliance classification, or null when unclassified.
    // NEVER treat this as "eBay approved" - only "APPROVED" means a real
    // filed approval, and even then the wording stays "classification".
    epnAiClassification: EPN_AI_CLASSIFICATIONS.includes(cls) ? cls : null,
    hasBufferToken: Boolean(String(env.BUFFER_ACCESS_TOKEN ?? "").trim()),
  };
}

// A one-line, human-readable summary of the current safety posture.
export function describeFlags(flags = readDistributionFlags()) {
  return [
    `publish switch: ${flags.publishEnabled ? "ENABLED" : "disabled (default)"}`,
    `mode: ${flags.dryRun ? "DRY RUN (default)" : "LIVE"}`,
    `EPN AI classification: ${flags.epnAiClassification ?? "UNCLASSIFIED (default)"}`,
    `Buffer token: ${flags.hasBufferToken ? "present" : "absent"}`,
  ].join("  |  ");
}

// --- timezone ---------------------------------------------------------
export const OWNER_TZ = "Australia/Brisbane"; // UTC+10, no DST

// Normalise any accepted schedule input to a UTC ISO string, or null for
// "publish now". Throws on a malformed/ambiguous value (fail closed - no
// guessing a timezone).
export function toUtcIso(input) {
  if (input == null || input === "" || input === "now") return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error("toUtcIso: invalid Date");
    return input.toISOString();
  }
  const s = String(input).trim();
  // Require an explicit offset or a trailing Z - a bare "2026-09-10 14:00"
  // is ambiguous and is rejected rather than assumed local/UTC.
  if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    throw new Error(
      `toUtcIso: "${s}" has no timezone. Pass an explicit offset (e.g. 2026-09-10T14:00:00+10:00) or a UTC "...Z" value.`
    );
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`toUtcIso: unparseable timestamp "${s}"`);
  return d.toISOString();
}

const BRISBANE_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: OWNER_TZ,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Display-only. Never stored, never sent to a provider.
export function brisbaneLabel(utcIso) {
  if (!utcIso) return "(publish now)";
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return "(invalid)";
  return `${BRISBANE_FMT.format(d)} ${OWNER_TZ} / ${d.toISOString()}`;
}
