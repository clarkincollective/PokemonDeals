// Phase SOCIAL-NEWSROOM-1 - CTA INTENSITY (§21).
//
// Not every post ends with the same website pitch. Each story carries a
// CTA intensity from its series definition; this module validates a
// planned SEQUENCE so the feed does not read as a wall of hard sells.
//
// HARD       - explicit "view / shop the deal" call. Conversion content.
// SOFT       - light nudge ("more like this on the site").
// BRAND_ONLY - name-drop, no action ask. Authority / data content.
// NONE       - no CTA at all. Pure story / education.
//
// Pure. No I/O.

export const CTA_INTENSITY = Object.freeze(["HARD", "SOFT", "BRAND_ONLY", "NONE"]);

const RANK = Object.freeze({ NONE: 0, BRAND_ONLY: 1, SOFT: 2, HARD: 3 });

// which intensities each content goal may legitimately use.
export const GOAL_ALLOWED_CTA = Object.freeze({
  CONVERSION: ["HARD", "SOFT"],
  REACH: ["SOFT", "BRAND_ONLY"],
  ENGAGEMENT: ["SOFT", "BRAND_ONLY", "NONE"],
  TRUST: ["BRAND_ONLY", "NONE"],
  BRAND: ["BRAND_ONLY", "NONE"],
});

export function ctaAllowedForGoal(goal, cta) {
  return (GOAL_ALLOWED_CTA[goal] ?? ["SOFT"]).includes(cta);
}

// §21 - a planned window must not be dominated by HARD CTAs, and must not
// end every post on a HARD/SOFT pitch. Returns
// { ok, hard_share, commercial_share, runs, warnings }.
//   items: ordered [{ cta_intensity }]
export const HARD_SHARE_CEILING = 0.4; // <=40% of a window may be HARD
export const COMMERCIAL_SHARE_CEILING = 0.65; // HARD+SOFT together
export const MAX_CONSECUTIVE_HARD = 2;

export function sequenceCtaCheck(items = []) {
  const n = items.length;
  if (!n) return { ok: true, hard_share: 0, commercial_share: 0, runs: [], warnings: [] };
  let hard = 0;
  let commercial = 0;
  let runLen = 0;
  let worstRun = 0;
  const runs = [];
  for (const it of items) {
    const cta = String(it.cta_intensity ?? it.cta ?? "SOFT").toUpperCase();
    if (cta === "HARD") {
      hard++;
      commercial++;
      runLen++;
      worstRun = Math.max(worstRun, runLen);
    } else {
      if (runLen > 0) runs.push(runLen);
      runLen = 0;
      if (cta === "SOFT") commercial++;
    }
  }
  if (runLen > 0) runs.push(runLen);

  const hard_share = Number((hard / n).toFixed(3));
  const commercial_share = Number((commercial / n).toFixed(3));
  const warnings = [];
  if (hard_share > HARD_SHARE_CEILING) warnings.push(`HARD CTA share ${(hard_share * 100).toFixed(0)}% > ${HARD_SHARE_CEILING * 100}% ceiling`);
  if (commercial_share > COMMERCIAL_SHARE_CEILING) warnings.push(`commercial (HARD+SOFT) share ${(commercial_share * 100).toFixed(0)}% > ${COMMERCIAL_SHARE_CEILING * 100}% ceiling`);
  if (worstRun > MAX_CONSECUTIVE_HARD) warnings.push(`${worstRun} HARD CTAs in a row (max ${MAX_CONSECUTIVE_HARD})`);

  return { ok: warnings.length === 0, hard_share, commercial_share, runs, warnings };
}

export { RANK as CTA_RANK };
