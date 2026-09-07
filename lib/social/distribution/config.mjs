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
//   EPN_AI_TOOLS_APPROVED      "true"  -> owner has recorded that the EPN
//                              compliance prerequisite is satisfied
//                              (see docs/social-compliance-readiness.md
//                              SS1 #2 + SS4). Unset -> NOT approved (default)
//
// NOTE: rights.mjs RIGHTS_STATE.publishing is a SEPARATE, code-reviewed
// gate ("DISABLED" today). BOTH it and SOCIAL_PUBLISH_ENABLED must say go.
export function readDistributionFlags(env = process.env) {
  const truthy = (v) => String(v ?? "").trim().toLowerCase() === "true";
  const falsy = (v) => String(v ?? "").trim().toLowerCase() === "false";
  return {
    publishEnabled: truthy(env.SOCIAL_PUBLISH_ENABLED),
    // dry-run is ON unless someone EXPLICITLY sets it to the string "false"
    dryRun: !falsy(env.SOCIAL_PUBLISH_DRY_RUN),
    epnAiToolsApproved: truthy(env.EPN_AI_TOOLS_APPROVED),
    hasBufferToken: Boolean(String(env.BUFFER_ACCESS_TOKEN ?? "").trim()),
  };
}

// A one-line, human-readable summary of the current safety posture.
export function describeFlags(flags = readDistributionFlags()) {
  return [
    `publish switch: ${flags.publishEnabled ? "ENABLED" : "disabled (default)"}`,
    `mode: ${flags.dryRun ? "DRY RUN (default)" : "LIVE"}`,
    `EPN prerequisite: ${flags.epnAiToolsApproved ? "recorded APPROVED" : "not approved (default)"}`,
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
