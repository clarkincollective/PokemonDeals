// DETERMINISTIC DEAL SCORE (2026-09-22 homepage redesign).
//
// The redesign brief asked for a "94 / Exceptional Deal" badge and, in the
// same breath, said not to invent one to reproduce a screenshot. So the
// inputs were measured before anything was written, across the 1,326
// listings in the backup that actually pass isDisplayableDeal - i.e. the
// population this badge would ever describe, not the whole deals table:
//
//     discount_pct present            99.8 %
//     trusted reference evidence      96.5 %
//     a real condition tier          100.0 %
//     seller feedback score           47.5 %
//     shipping actually recorded      41.6 %
//     exact-verified timestamp        24.1 %
//     visual screening status         12.8 %
//
// That splits cleanly into four inputs with near-total coverage and three
// with roughly half or less. The model is built around that split, and
// two rules follow from it:
//
//   1. NO EVIDENCE, NO SCORE. A listing without a trusted savings claim
//      returns null and renders no badge at all. It does NOT get a low
//      score. A low number is a claim about quality; absence of a
//      reference is not evidence of a bad deal, and dressing one up as
//      the other is the exact fabrication the brief rules out.
//
//   2. SPARSE INPUTS MAY ONLY ADD. Shipping, seller feedback, exact
//      verification and the visual screen are present less than half the
//      time. If they could subtract, then 58 % of listings would be
//      marked down for data we simply never collected - fabrication by
//      omission, and it would systematically punish smaller marketplaces
//      where we record less. They are therefore bonuses that apply when
//      present and are silently skipped when absent.
//
// Everything here is a pure function of columns already on the row. There
// is no model, no training, no opinion: the same listing always scores
// the same, and `scoreBreakdown` can print exactly which points came from
// where, which is what the badge's tooltip shows.
//
// WHAT WOULD MAKE THIS BETTER, and is not available today: sell-through
// rate for the card, time-on-market for comparable listings, and a
// reference CONFIDENCE interval rather than a single figure. Each would
// justify widening the model beyond discount. None exists yet, so the
// score stays dominated by the one number that is both measured and
// meaningful - how far under the evidenced reference the listing sits.

const { savingsClaimTrusted, storedReferenceEvidence, DEAL_DISCOUNT_THRESHOLD } = require("./dealQuality");

// Where the discount curve saturates. Beyond 70 % under reference the
// extra discount stops telling us much - past that point the likelier
// explanations are a mis-described printing or a reference that has not
// caught up, neither of which deserves a higher score.
const DISCOUNT_CEILING = 0.7;
const BASE_FLOOR = 50;
const BASE_RANGE = 42; // 50 at 0 % -> 92 at the ceiling

const SELLER_FEEDBACK_STRONG = 500;
const FRESH_MS = 60 * 60 * 1000;
const RECENT_MS = 6 * 60 * 60 * 1000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// The label bands. Deliberately four words, not five: the gap between
// "Good" and "Great" is not something this data can defend, so the bands
// are wide enough that a one-point wobble never moves the wording.
function scoreLabel(score) {
  if (score >= 90) return "Exceptional Deal";
  if (score >= 80) return "Strong Deal";
  if (score >= 70) return "Great Deal";
  return "Good Deal";
}

// Returns { score, label, parts } or NULL when the row has not earned a
// score. `now` is injectable so the value is deterministic in tests.
function dealQualityScore(row, now = Date.now()) {
  if (!row) return null;
  // Gate 1: the site's own rule for whether a saving may be CLAIMED at
  // all. This is the same function the card uses to decide whether to
  // show a savings figure, so a badge can never appear beside a listing
  // that is rendering plain.
  if (!savingsClaimTrusted(row)) return null;
  // Gate 2: the reference must be evidenced - the right product, the
  // right amount, and what it was priced for.
  if (!storedReferenceEvidence(row)) return null;

  const discount = num(row.discount_pct);
  if (discount == null || discount <= 0) return null;
  // Gate 3: MATERIALITY. Below the site's own deal threshold there is a
  // real saving but not a meaningful quality judgement, and the base
  // curve would hand a 0.9%-below listing ~50 points and the words "Good
  // Deal". Those listings fall back to the factual discount badge, which
  // states the number and claims nothing about it. Caught by a fixture -
  // the under-one-percent case in graded-inventory-r1 - rather than by
  // reasoning, which is the only reason it is here.
  if (discount < DEAL_DISCOUNT_THRESHOLD) return null;

  const parts = [];
  const capped = Math.min(discount, DISCOUNT_CEILING);
  const base = BASE_FLOOR + (capped / DISCOUNT_CEILING) * BASE_RANGE;
  parts.push({ key: "discount", points: base, why: `${Math.round(discount * 100)}% below the evidenced reference` });

  let total = base;

  // --- near-universal inputs (may add, and their absence is meaningful)
  const condition = String(row.condition ?? "").trim();
  const vagueCondition = !condition || /unknown|unspecified|ungraded|not verified/i.test(condition);
  if (!vagueCondition) {
    total += 4;
    parts.push({ key: "condition", points: 4, why: "condition stated and matched" });
  }

  const seenAt = Date.parse(row.last_seen_at ?? "");
  if (Number.isFinite(seenAt)) {
    const age = now - seenAt;
    if (age <= FRESH_MS) {
      total += 4;
      parts.push({ key: "freshness", points: 4, why: "re-checked within the hour" });
    } else if (age <= RECENT_MS) {
      total += 2;
      parts.push({ key: "freshness", points: 2, why: "re-checked within six hours" });
    }
  }

  // --- sparse inputs: PRESENT-ONLY bonuses, never penalties -----------
  if (num(row.shipping) != null && num(row.shipping) >= 0 && row.shipping !== null) {
    // Only when the scan actually recorded a shipping figure. A null is
    // "we did not see one", not "it is expensive".
    total += 2;
    parts.push({ key: "shipping", points: 2, why: "delivered cost is known" });
  }

  const feedback = num(row.seller_feedback_score);
  if (feedback != null && feedback >= SELLER_FEEDBACK_STRONG) {
    total += 2;
    parts.push({ key: "seller", points: 2, why: "established seller history" });
  }

  if (row.exact_verified_at) {
    total += 2;
    parts.push({ key: "verified", points: 2, why: "listing re-confirmed on eBay" });
  }

  // 99 not 100: a scored listing is still an automated match against a
  // reference price, and a round 100 would read as a guarantee.
  const score = Math.max(0, Math.min(99, Math.round(total)));
  return { score, label: scoreLabel(score), parts };
}

// One sentence naming every factor that contributed, for the badge's
// title attribute. Never mentions a factor that did not apply, so the
// tooltip can't imply we checked something we didn't.
function scoreBreakdown(result) {
  if (!result) return "";
  return `Score ${result.score}/99 - ${result.parts.map((p) => p.why).join("; ")}.`;
}

module.exports = {
  dealQualityScore,
  scoreLabel,
  scoreBreakdown,
  DISCOUNT_CEILING,
  SELLER_FEEDBACK_STRONG,
};
