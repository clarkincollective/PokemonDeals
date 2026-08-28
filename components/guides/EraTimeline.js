// Rough eras of the Pokémon TCG and what drives value differently in each.
const BANDS = [
  {
    x: 20,
    w: 150,
    title: "Vintage · WOTC",
    years: "1999–2003",
    notes: ["small fixed print runs", "1st Edition / Shadowless"],
    cls: "fill-red-500/15",
  },
  {
    x: 176,
    w: 180,
    title: "Middle era",
    years: "2003–2016",
    notes: ["large print runs", "long overlooked"],
    cls: "fill-amber-500/15",
  },
  {
    x: 362,
    w: 140,
    title: "Modern",
    years: "2017–now",
    notes: ["alt-art chase cards", "sealed still printing"],
    cls: "fill-emerald-500/15",
  },
];

export default function EraTimeline() {
  return (
    <svg
      viewBox="0 0 520 140"
      className="h-auto w-full max-w-xl"
      role="img"
      aria-label="Three eras of the Pokemon TCG: Vintage / WOTC 1999 to 2003 (small fixed print runs, 1st Edition and Shadowless), the middle era 2003 to 2016 (large print runs, long overlooked), and Modern 2017 to now (alternate-art chase cards, sealed product still being printed)."
    >
      {BANDS.map((b) => {
        const cx = b.x + b.w / 2;
        return (
          <g key={b.title}>
            <rect x={b.x} y="20" width={b.w} height="52" rx="6" className={b.cls} />
            <text x={cx} y="41" textAnchor="middle" className="fill-current text-[12px] font-semibold">
              {b.title}
            </text>
            <text x={cx} y="58" textAnchor="middle" className="fill-current text-[10px] opacity-60">
              {b.years}
            </text>
            {b.notes.map((n, i) => (
              <text key={n} x={cx} y={104 + i * 15} textAnchor="middle" className="fill-current text-[10px] opacity-55">
                {n}
              </text>
            ))}
          </g>
        );
      })}
      <line x1="20" y1="84" x2="502" y2="84" className="stroke-current opacity-30" strokeWidth="1.5" />
      <path d="M502 84 l-9 -4 v8 z" className="fill-current opacity-30" />
    </svg>
  );
}
