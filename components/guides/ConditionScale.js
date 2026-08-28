// Visual of the five raw-condition tiers, bar length standing in for
// "how much of Near Mint value it typically holds" (no real numbers -
// the gap varies by card).
const TIERS = [
  { key: "NM", label: "Near Mint", w: 300, cls: "fill-emerald-500/80" },
  { key: "LP", label: "Lightly Played", w: 232, cls: "fill-emerald-500/55" },
  { key: "MP", label: "Moderately Played", w: 168, cls: "fill-amber-500/60" },
  { key: "HP", label: "Heavily Played", w: 110, cls: "fill-orange-500/60" },
  { key: "DMG", label: "Damaged", w: 64, cls: "fill-red-500/55" },
];

export default function ConditionScale() {
  return (
    <svg
      viewBox="0 0 520 196"
      className="h-auto w-full max-w-xl"
      role="img"
      aria-label="Raw card condition tiers from Near Mint down to Damaged, bar length showing roughly how much of Near Mint value each tier holds - value falls off sharply as condition drops."
    >
      {TIERS.map((t, i) => {
        const y = 12 + i * 40;
        return (
          <g key={t.key}>
            <text x="0" y={y + 15} className="fill-current text-[11px] font-semibold">
              {t.key}
            </text>
            <text x="34" y={y + 15} className="fill-current text-[11px] opacity-70">
              {t.label}
            </text>
            <rect x="188" y={y} width={t.w} height="22" rx="4" className={t.cls} />
          </g>
        );
      })}
    </svg>
  );
}
