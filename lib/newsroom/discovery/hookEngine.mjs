// Phase SOCIAL-DISCOVERY-1 SS25/SS26 - HOOK GENERATION + SCORING + CLICKBAIT SAFETY.

const money = (n) => (n == null ? null : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: Number(n) < 100 ? 2 : 0 })}`);

// Overstated/forbidden framings - never generated, and hard-rejected if
// ever supplied to auditHookSafety (defense in depth, matches SS26).
const CLICKBAIT_PATTERNS = [
  /\bcrash(ing)?\b/i, /\babout to (explode|double|skyrocket)\b/i, /\bbuy this before\b/i,
  /\bguarantee[ds]?\b/i, /\binvest(ment)?\b/i, /\bwon'?t believe\b/i, /\bshocking\b/i,
];

function factsOf(pkg) {
  const sem = pkg?.semantic_manifest ?? {};
  const snap = pkg?.snapshot ?? {};
  return {
    pct: sem.claim_value ?? snap.derived_percentages?.under_25_pct ?? null,
    population: snap.tracked_population ?? null,
    asking: sem.comparison_left?.value ?? null,
    market: sem.comparison_right?.value ?? null,
    gapPct: sem.comparison_pct ?? null,
    direction: sem.comparison_direction ?? null,
    example: sem.example_card ?? null,
  };
}

/**
 * generateHookCandidates(pkg) -> [{ archetype, text, score }]
 * Every candidate is built ONLY from real snapshot/manifest values - no
 * archetype fires unless its required fact is actually present.
 */
export function generateHookCandidates(pkg) {
  const f = factsOf(pkg);
  const out = [];
  if (f.pct != null && f.population != null) {
    out.push({ archetype: "SURPRISING_STAT", text: `${f.pct}% of the ${f.population.toLocaleString("en-US")} Pokemon singles we tracked are under $25.` });
    out.push({ archetype: "MYTH_BUST", text: "Most Pokemon cards aren't expensive." });
    out.push({ archetype: "QUESTION", text: "How much of the Pokemon card market is actually affordable?" });
  }
  if (f.asking != null && f.market != null) {
    out.push({ archetype: "PRICE_GAP", text: `This card is asking ${money(f.asking)}. Recent market: ${money(f.market)}.` });
    out.push({ archetype: "UTILITY", text: "Before buying a Pokemon card, compare the asking price with the market." });
  }
  if (f.example) out.push({ archetype: "ENTITY_LED", text: `${f.example} is a real example worth a closer look.` });
  return out.map((h) => ({ ...h, score: scoreHook(h.text, pkg) }));
}

/**
 * scoreHook(text, pkg) -> 0-10 (specificity + factual grounding + brevity)
 */
export function scoreHook(text, pkg) {
  const s = String(text ?? "");
  const hasNumber = /\d/.test(s);
  const words = s.split(/\s+/).filter(Boolean).length;
  const safety = auditHookSafety(s);
  let score = 5;
  if (hasNumber) score += 2;
  if (words >= 6 && words <= 22) score += 2;
  if (!safety.ok) score = 0;
  return score;
}

/**
 * auditHookSafety(text) -> { ok, findings }
 * Rejects overstated framings (SS26) regardless of source.
 */
export function auditHookSafety(text) {
  const s = String(text ?? "");
  const findings = CLICKBAIT_PATTERNS.filter((re) => re.test(s)).map((re) => ({ code: "CLICKBAIT_SAFETY_FAIL", detail: `hook matches an overstated/forbidden framing: ${re}` }));
  return { ok: findings.length === 0, findings };
}

/** pickBestHook(pkg) -> the strongest valid candidate, or null */
export function pickBestHook(pkg) {
  const candidates = generateHookCandidates(pkg).filter((c) => c.score > 0);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}
