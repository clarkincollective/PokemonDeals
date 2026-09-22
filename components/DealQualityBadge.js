import { scoreBreakdown } from "@/lib/dealQualityScore";

// The deal-quality badge: a label and a number, from lib/dealQualityScore.
//
// Two separate pieces deliberately, because they answer different
// questions at different distances. The LABEL ("Exceptional Deal") is
// read while scanning a grid; the NUMBER is read when comparing two cards
// side by side. The mockup puts them in opposite corners of the artwork
// and that turns out to be right - a single combined chip made the label
// too small to scan and the number too quiet to compare.
//
// Renders nothing when `result` is null. That is the important case: a
// listing without a trusted, evidenced reference gets NO badge rather
// than a low one (see the header comment in lib/dealQualityScore). Callers
// must not substitute a placeholder.
//
// Colour: the label pill is neutral-on-white with a green rule for the
// two top bands, NOT brand red. Red is the CTA colour on this site and a
// red quality chip beside a red button reads as a second action. Green is
// already the savings language, so a green-leaning quality mark says the
// same thing the savings line says.
//
// rev 2 (2026-09-22): the two top labels were near-identical pale tints,
// so "Exceptional Deal" and "Strong Deal" looked the same while scanning
// - which wastes the one signal the label exists to give. Exceptional is
// now a SOLID emerald fill with white ink (the same 5.6:1 the savings
// badge uses), Strong keeps the tint, and the two lower labels stay
// neutral. The ladder does the work: only the genuinely top band is
// allowed to read as loud, for the same reason SavingsBadge keeps its
// `modest` tier quiet.
const LABEL_CLASS = {
  "Exceptional Deal":
    "border-emerald-700 bg-emerald-600 text-white shadow-[0_3px_10px_rgb(4_120_87/0.3)]",
  "Strong Deal": "border-emerald-600/40 bg-emerald-50 text-emerald-700",
  "Great Deal": "border-zinc-200 bg-white/95 text-zinc-700",
  "Good Deal": "border-zinc-200 bg-white/95 text-zinc-600",
};

// The number, sized by band. A 93 and a 62 were rendering in the same
// chip, so the number had to be read rather than seen; now the top band
// is bigger and ringed, the middle band solid, the rest as before.
function scoreClass(score) {
  if (score >= 85) return "h-9 min-w-9 px-2 text-base ring-2 ring-white/80 shadow-[0_6px_18px_rgb(4_120_87/0.4)] dark:ring-white/40";
  if (score >= 70) return "h-8 min-w-8 px-1.5 text-sm shadow-[0_3px_10px_rgb(4_120_87/0.28)]";
  return "h-7 min-w-7 px-1.5 text-sm shadow-sm";
}

export function DealQualityLabel({ result, className = "" }) {
  if (!result) return null;
  return (
    <span
      data-deal-quality-label={result.label}
      title={scoreBreakdown(result)}
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold leading-4 shadow-sm ${
        LABEL_CLASS[result.label] ?? LABEL_CLASS["Good Deal"]
      } ${className}`}
    >
      {result.label}
    </span>
  );
}

export function DealQualityScore({ result, className = "" }) {
  if (!result) return null;
  return (
    <span
      data-deal-quality-score={result.score}
      // The accessible name says what the number MEANS. "94" alone is
      // meaningless to a screen reader, and "94 out of 99" still doesn't
      // say 94 of what.
      aria-label={`Deal quality ${result.score} out of 99 - ${result.label}`}
      title={scoreBreakdown(result)}
      className={`tnum inline-flex items-center justify-center rounded-md bg-emerald-600 font-black leading-none text-white ${scoreClass(
        result.score
      )} ${className}`}
    >
      <span aria-hidden="true">{result.score}</span>
    </span>
  );
}
