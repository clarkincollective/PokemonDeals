// Phase SOCIAL-NEWSROOM-2C - DETERMINISTIC CREATIVE QA FOR EDITORIAL
// LAYOUTS (SS8).
//
// lib/social/creativeQa.scoreCreative is tuned for the deal/mover/carousel
// creative families (card occupancy, big-number density). Editorial
// typographic layouts (dashboard / ranking / reveal / process / statement)
// have no card and a different density profile, so they get their own
// deterministic check here. Same PASS / WATCH / FAIL contract.
//
// Pure. No I/O.

export const EDITORIAL_QA_LIMITS = Object.freeze({
  hook_max_lines: 3,
  min_text_px: 22,
  cta_max: 1, // 0 or 1 - never two calls to action
  wordmark_exact: 1,
  stat_callouts_max: 6, // a dashboard/ranking may show several numbers
  body_max_chars: 320,
  safe_inset_min: { ig_45: 72, short_916: 90 },
});

const CHARS_PER_LINE = 24; // ~62-82px display type on a ~910px column

export function estimateLines(text, cpl = CHARS_PER_LINE) {
  const s = String(text ?? "").trim();
  if (!s) return 0;
  return s
    .split(/\s*(?:<br\s*\/?>|\n)\s*/)
    .reduce((a, seg) => a + Math.max(1, Math.ceil(seg.length / cpl)), 0);
}

// meta: { target, layout_family, hookText, hookPx, ctaCount, wordmarkCount,
//   minInlineFontPx, statCallouts:[..], bodyChars, safe:{top,right,bottom,left} }
export function editorialCreativeQa(meta = {}) {
  const checks = [];
  const add = (id, ok, severity, note) => checks.push({ id, ok, severity, note });

  const lines = estimateLines(meta.hookText, meta.target === "short_916" ? 20 : CHARS_PER_LINE);
  add("hook_lines", lines <= EDITORIAL_QA_LIMITS.hook_max_lines, "P1", `hook ~${lines} lines (max ${EDITORIAL_QA_LIMITS.hook_max_lines})`);

  const minPx = Number(meta.minInlineFontPx);
  add("min_text_px", !Number.isFinite(minPx) || minPx >= EDITORIAL_QA_LIMITS.min_text_px, "P1", `smallest text ${minPx}px (min ${EDITORIAL_QA_LIMITS.min_text_px})`);

  const cta = Number(meta.ctaCount ?? 0);
  add("cta_count", cta >= 0 && cta <= EDITORIAL_QA_LIMITS.cta_max, "P0", `${cta} CTA (allowed 0-${EDITORIAL_QA_LIMITS.cta_max})`);

  const wm = Number(meta.wordmarkCount ?? 1);
  add("wordmark", wm === EDITORIAL_QA_LIMITS.wordmark_exact, "P1", `${wm} wordmark lockups (want exactly 1)`);

  const stats = Array.isArray(meta.statCallouts) ? meta.statCallouts.length : 0;
  add("stat_density", stats <= EDITORIAL_QA_LIMITS.stat_callouts_max, "P1", `${stats} numeric callouts (max ${EDITORIAL_QA_LIMITS.stat_callouts_max})`);
  // no duplicate stat value - but a multi-card grid (three_up / printing_compare)
  // legitimately shows two different cards at the same price or % off, so the
  // dedupe check only applies to single-subject layouts.
  const MULTI_ITEM = new Set(["three_up", "printing_compare"]);
  if (Array.isArray(meta.statCallouts) && !MULTI_ITEM.has(meta.layout_family)) {
    const uniq = new Set(meta.statCallouts.map((s) => String(s).trim()));
    add("stat_distinct", uniq.size === meta.statCallouts.length, "P2", "a numeric callout is repeated");
  }

  const bodyChars = Number(meta.bodyChars ?? 0);
  add("body_length", !bodyChars || bodyChars <= EDITORIAL_QA_LIMITS.body_max_chars, "P2", `supporting text ${bodyChars} chars (max ${EDITORIAL_QA_LIMITS.body_max_chars})`);

  const need = EDITORIAL_QA_LIMITS.safe_inset_min[meta.target] ?? 72;
  const safe = meta.safe ?? {};
  const safeOk = ["top", "right", "bottom", "left"].every((k) => Number(safe[k] ?? need) >= need);
  add("safe_zone", safeOk, "P1", `safe insets below ${need}px`);

  const hardFail = checks.some((c) => !c.ok && (c.severity === "P0" || c.severity === "P1"));
  const soft = checks.some((c) => !c.ok);
  const grade = hardFail ? "FAIL" : soft ? "WATCH" : "PASS";
  return { grade, checks, failed: checks.filter((c) => !c.ok).map((c) => c.id) };
}
