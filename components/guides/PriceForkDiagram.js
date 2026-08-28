// One Pokémon name forks into many prices: each attribute (printing,
// edition, condition, grade) multiplies the number of distinct markets.
const STAGES = ["Printing", "Edition", "Condition", "Grade"];

export default function PriceForkDiagram() {
  return (
    <svg
      viewBox="0 0 500 132"
      className="h-auto w-full max-w-lg"
      role="img"
      aria-label="A single card name splits into many prices: printing, then edition, then condition, then grade, each multiplying the number of separate markets, ending in a wide price range rather than one number."
    >
      {/* root */}
      <rect
        x="8"
        y="42"
        width="94"
        height="44"
        rx="6"
        className="fill-zinc-100 stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-700"
        strokeWidth="1.5"
      />
      <text x="55" y="61" textAnchor="middle" className="fill-current text-[11px] font-bold">
        one
      </text>
      <text x="55" y="76" textAnchor="middle" className="fill-current text-[11px] font-bold">
        card name
      </text>

      {STAGES.map((label, i) => {
        const x = 132 + i * 82;
        const dots = i + 2; // 2, 3, 4, 5 branches
        return (
          <g key={label}>
            <line x1={x - 22} y1="64" x2={x - 4} y2="64" className="stroke-current opacity-25" strokeWidth="1.5" />
            {Array.from({ length: dots }).map((_, d) => (
              <circle key={d} cx={x + 4} cy={64 - ((dots - 1) * 9) / 2 + d * 9} r="3" className="fill-red-500/70" />
            ))}
            <text x={x + 4} y="112" textAnchor="middle" className="fill-current text-[10px] font-semibold">
              {label}
            </text>
          </g>
        );
      })}

      {/* result */}
      <line x1="456" y1="64" x2="474" y2="64" className="stroke-current opacity-25" strokeWidth="1.5" />
      <text x="492" y="58" textAnchor="end" className="fill-current text-[11px] font-bold">
        a range
      </text>
      <text x="492" y="73" textAnchor="end" className="fill-current text-[11px] font-bold">
        of prices
      </text>
    </svg>
  );
}
