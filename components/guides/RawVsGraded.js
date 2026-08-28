// Same card, two markets: a raw card (seller's own condition claim) vs a
// third-party slab with a fixed grade.
export default function RawVsGraded() {
  return (
    <svg
      viewBox="0 0 520 210"
      className="h-auto w-full max-w-xl"
      role="img"
      aria-label="A raw card, priced on the seller's own condition description, next to a graded slab with a fixed PSA 10 grade that trades in its own, usually higher, market."
    >
      {/* RAW */}
      <rect
        x="24"
        y="30"
        width="150"
        height="150"
        rx="8"
        className="fill-zinc-100 stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-700"
        strokeDasharray="5 4"
        strokeWidth="1.5"
      />
      <text x="99" y="20" textAnchor="middle" className="fill-current text-[12px] font-semibold">
        RAW
      </text>
      <text x="99" y="110" textAnchor="middle" className="fill-current text-[10px] opacity-70">
        condition =
      </text>
      <text x="99" y="124" textAnchor="middle" className="fill-current text-[10px] opacity-70">
        seller&apos;s word
      </text>

      {/* arrow + multiplier */}
      <line
        x1="188"
        y1="105"
        x2="322"
        y2="105"
        className="stroke-current opacity-40"
        strokeWidth="1.5"
      />
      <path d="M322 105 l-10 -5 v10 z" className="fill-current opacity-40" />
      <text x="255" y="96" textAnchor="middle" className="fill-red-600 text-[12px] font-bold dark:fill-red-500">
        × several
      </text>
      <text x="255" y="122" textAnchor="middle" className="fill-current text-[9px] opacity-60">
        at top grades
      </text>

      {/* SLAB */}
      <rect
        x="336"
        y="20"
        width="160"
        height="172"
        rx="10"
        className="fill-white stroke-zinc-300 dark:fill-zinc-950 dark:stroke-zinc-600"
        strokeWidth="1.5"
      />
      <rect x="348" y="30" width="136" height="26" rx="4" className="fill-indigo-500/15" />
      <text x="416" y="47" textAnchor="middle" className="fill-indigo-600 text-[11px] font-bold dark:fill-indigo-400">
        PSA 10 · GEM MINT
      </text>
      <rect
        x="356"
        y="66"
        width="120"
        height="116"
        rx="4"
        className="fill-zinc-100 stroke-zinc-200 dark:fill-zinc-900 dark:stroke-zinc-800"
      />
      <text x="416" y="12" textAnchor="middle" className="fill-current text-[12px] font-semibold">
        GRADED
      </text>
    </svg>
  );
}
