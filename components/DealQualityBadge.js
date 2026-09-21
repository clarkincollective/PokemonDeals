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
const LABEL_CLASS = {
  "Exceptional Deal": "border-emerald-600/30 bg-emerald-50 text-emerald-700",
  "Strong Deal": "border-emerald-600/25 bg-emerald-50/70 text-emerald-700",
  "Great Deal": "border-zinc-200 bg-white/95 text-zinc-700",
  "Good Deal": "border-zinc-200 bg-white/95 text-zinc-600",
};

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
      className={`tnum inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-emerald-600 px-1.5 text-sm font-black leading-none text-white shadow-sm ${className}`}
    >
      <span aria-hidden="true">{result.score}</span>
    </span>
  );
}
