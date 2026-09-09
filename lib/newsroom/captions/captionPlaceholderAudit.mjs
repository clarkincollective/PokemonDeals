// Phase SOCIAL-CAPTION-5B.1 SS5 - NULL/UNDEFINED/PLACEHOLDER HARD FAIL.
//
// Deterministic detection of production-invalid placeholder leakage - the
// literal serialized-value artifacts a template-interpolation bug or an
// unguarded ${field} produces, distinct from any legitimate prose use of
// a word like "unknown". Pure, no I/O.

export const CAPTION_PLACEHOLDER_AUDIT_VERSION = "5b1.1";

// Each pattern is checked as a standalone TOKEN (word-boundaried, case
// sensitive where the artifact is inherently a specific casing like
// "NaN"/"undefined"/"[object Object]") so ordinary prose is never caught:
// "the price is unknown" is fine; a bare "unknown" is caught only via the
// UPPERCASE "UNKNOWN" placeholder pattern (a template default, never how
// this brand's real prose writes the word).
const PLACEHOLDER_PATTERNS = [
  { code: "literal_null", re: /\bnull\b/ },
  { code: "literal_undefined", re: /\bundefined\b/ },
  { code: "literal_nan", re: /\bNaN\b/ },
  { code: "object_object", re: /\[object Object\]/ },
  { code: "literal_TBD", re: /\bTBD\b/ },
  { code: "literal_TODO", re: /\bTODO\b/ },
  { code: "literal_UNKNOWN_upper", re: /\bUNKNOWN\b/ },
  { code: "mustache_template", re: /\{\{[^}]*\}\}/ },
  { code: "template_literal", re: /\$\{[^}]*\}/ },
  { code: "angle_placeholder", re: /<\s*[a-z_ -]*placeholder[a-z_ -]*\s*>/i },
  // a dangling separator immediately followed by punctuation/end-of-line -
  // the shape left behind when an interpolated field resolved to "" but
  // its surrounding label/punctuation was still emitted (e.g. "Set: ." or
  // "Example: ,").
  { code: "dangling_label", re: /\b(Set|Card|Rarity|Printing|Variant|Example|Population|Source|Timeframe)\s*:\s*[.,;]/i },
];

/**
 * auditPlaceholders(text) -> [{ code: "CAPTION_PLACEHOLDER_FAIL", detail }]
 * Empty array = clean.
 */
export function auditPlaceholders(text) {
  const s = String(text ?? "");
  const findings = [];
  for (const p of PLACEHOLDER_PATTERNS) {
    const m = s.match(p.re);
    if (m) findings.push({ code: "CAPTION_PLACEHOLDER_FAIL", detail: `production placeholder leaked into the caption (${p.code}): "${m[0]}"` });
  }
  return findings;
}
