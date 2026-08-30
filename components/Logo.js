export default function Logo({ size = "large" }) {
  const isLarge = size === "large";

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={isLarge ? 36 : 24}
        height={isLarge ? 36 : 24}
        viewBox="0 0 150 150"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={`logo-glass-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B5B" />
            <stop offset="100%" stopColor="#DC2626" />
          </linearGradient>
        </defs>
        <circle
          cx="58"
          cy="58"
          r="40"
          fill="none"
          stroke={`url(#logo-glass-${size})`}
          strokeWidth="13"
        />
        <line
          x1="87"
          y1="87"
          x2="128"
          y2="128"
          stroke={`url(#logo-glass-${size})`}
          strokeWidth="17"
          strokeLinecap="round"
        />
      </svg>
      <span className={isLarge ? "text-3xl font-bold tracking-tight sm:text-4xl" : "text-lg font-bold tracking-tight"}>
        <span className="text-red-600 dark:text-red-500">Pokemon</span>{" "}
        <span className="text-black dark:text-zinc-50">Deal Finder</span>
      </span>
    </span>
  );
}
