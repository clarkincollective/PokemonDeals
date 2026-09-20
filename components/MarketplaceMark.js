// UI audit 2026-09-20 - the marketplace mark.
//
// Every marketplace used to be shown with a flag emoji (🇺🇸 🇬🇧 …). Windows
// has no flag glyphs: Chrome and Edge there render the pair of regional
// indicator letters instead, so a large share of desktop visitors saw
// "U S" boxes beside "eBay US" and in the header control. A typographic
// mark - the marketplace's two-letter code set in the mono face - renders
// identically on every platform, reads as data rather than decoration,
// and matches the numerals it sits beside. The code is decorative here:
// the visible words ("eBay UK", "United Kingdom") carry the meaning, so
// the mark is aria-hidden wherever those words are present.
//
// `code`: the short marketplace code ("US", "UK", "AU", …). No code (the
// "all marketplaces" choice) renders a small globe glyph instead.

const GLOBE = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3" aria-hidden="true">
    <circle cx="8" cy="8" r="6.2" />
    <path d="M1.8 8h12.4M8 1.8c2.2 2 2.2 10.4 0 12.4M8 1.8c-2.2 2-2.2 10.4 0 12.4" />
  </svg>
);

export default function MarketplaceMark({ code = null, className = "" }) {
  const c = typeof code === "string" && code.trim() ? code.trim().toUpperCase() : null;
  return (
    <span
      aria-hidden="true"
      data-marketplace-mark={c ?? "all"}
      className={`inline-flex h-4 min-w-[1.65rem] shrink-0 items-center justify-center rounded-[4px] border border-current/25 px-1 font-mono text-[10px] font-bold leading-none tracking-[0.08em] ${className}`}
    >
      {c ?? GLOBE}
    </span>
  );
}
