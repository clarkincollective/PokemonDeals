// Phase SOCIAL-NEWSROOM-1 - CAPTION NEAR-DUPLICATE DETECTION (§18, §41).
//
// Deterministic text similarity - NO embeddings. Two signals combined:
//   - token Jaccard (bag of normalised words)
//   - 3-gram (shingle) Jaccard (catches reordered but templated text)
//   - a structural skeleton match (numbers -> #, casing/punctuation
//     stripped) - catches "$X CARD. LISTED FOR $Y" repeated with new
//     numbers.
//
// Used to block substantially similar captions ON THE SAME PLATFORM.
// Platform-native captions for the same story SHOULD differ (§19), so
// cross-platform pairs are only checked for the structural skeleton.
//
// Pure. No I/O.

const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "is", "it",
  "this", "that", "with", "at", "by", "from", "as", "was", "are", "be",
]);

export function normaliseTokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]\w+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

// numbers -> '#', words -> 'w', collapse - a shape fingerprint.
export function skeleton(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")
    .replace(/[#@]\w+/g, " tag ")
    .replace(/\$?\d[\d,.]*%?/g, "#")
    .replace(/[a-z]+/g, "w")
    .replace(/[^#w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(aSet, bSet) {
  if (!aSet.size && !bSet.size) return 1;
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter++;
  return inter / (aSet.size + bSet.size - inter);
}

function shingles(tokens, k = 3) {
  const out = new Set();
  for (let i = 0; i + k <= tokens.length; i++) out.add(tokens.slice(i, i + k).join(" "));
  if (!out.size && tokens.length) out.add(tokens.join(" "));
  return out;
}

// Returns { token, shingle, skeleton, numeric_template_match, score }.
//   skeleton               - structural similarity (0..1)
//   numeric_template_match  - true only when the two skeletons are
//                             IDENTICAL *and* contain a numeric slot (#) -
//                             i.e. a real "$X CARD, $Y" template repeat,
//                             not two prose sentences of similar shape.
//   score                   - max(token, shingle) [+ 0.95 if a numeric
//                             template repeats]. A pure-prose structural
//                             coincidence does NOT inflate the score.
export function captionSimilarity(a, b) {
  const ta = normaliseTokens(a);
  const tb = normaliseTokens(b);
  const token = jaccard(new Set(ta), new Set(tb));
  const shingle = jaccard(shingles(ta), shingles(tb));
  const skA = skeleton(a);
  const skB = skeleton(b);
  const skeletonMatch = skA && skA === skB ? 1 : jaccard(new Set(skA.split(" ")), new Set(skB.split(" ")));
  const numericTemplateMatch = skA.length > 0 && skA === skB && skA.includes("#");
  return {
    token: Number(token.toFixed(3)),
    shingle: Number(shingle.toFixed(3)),
    skeleton: Number(skeletonMatch.toFixed(3)),
    numeric_template_match: numericTemplateMatch,
    score: Number(Math.max(token, shingle, numericTemplateMatch ? 0.95 : 0).toFixed(3)),
  };
}

// same-platform block threshold; cross-platform only blocks on an exact
// skeleton match (structure identical, only numbers changed).
export const SAME_PLATFORM_BLOCK = 0.72;
export const SKELETON_BLOCK = 1.0;

// candidate: { platform, caption }. recent: [{ platform, caption }] (queued
// + published + planned). Returns { blocked, reason, worst:{...} }.
export function captionDuplicateCheck(candidate, recent = []) {
  let worst = null;
  for (const r of recent) {
    const sim = captionSimilarity(candidate.caption, r.caption);
    const samePlatform = String(r.platform) === String(candidate.platform);
    // block on: real near-duplicate TEXT on the same platform, OR a
    // repeated NUMERIC TEMPLATE (any platform). A pure-prose structural
    // coincidence between two different editorial sentences is NOT a
    // violation.
    const nearDupeText = samePlatform && Math.max(sim.token, sim.shingle) >= SAME_PLATFORM_BLOCK;
    const blockedHere = nearDupeText || sim.numeric_template_match;
    if (!worst || sim.score > worst.sim.score) worst = { sim, ref: r, samePlatform, blockedHere };
    if (blockedHere) {
      return {
        blocked: true,
        reason: nearDupeText
          ? `caption is ${(Math.max(sim.token, sim.shingle) * 100).toFixed(0)}% word-similar to a recent ${r.platform} caption (>= ${SAME_PLATFORM_BLOCK * 100}%)`
          : `caption reuses an identical numeric-template skeleton from a recent ${r.platform} caption`,
        worst,
      };
    }
  }
  return { blocked: false, reason: null, worst };
}
