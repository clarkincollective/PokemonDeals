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
            <stop offset="0%" stopColor="#FF5C6E" />
            <stop offset="100%" stopColor="#FF2942" />
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
      {/* small: the wordmark steps down at phone widths and, below 360px,
          becomes screen-reader-only so the header (mark + region control +
          menu) fits a 320px viewport without sideways scrolling */}
      <span className={isLarge ? "text-3xl font-bold tracking-tight sm:text-4xl" : "whitespace-nowrap text-base font-bold tracking-tight max-[359px]:sr-only sm:text-lg"}>
        {/* 2026-09-22: the mark and the word "Deal" carry the brand red;
            "Pokemon" and "Finder" stay white. Same wordmark, same order,
            same symbol - only which word is red has changed. */}
        <span className="text-black dark:text-zinc-50">Pokemon</span>{" "}
        <span className="text-red-500">Deal</span>{" "}
        <span className="text-black dark:text-zinc-50">Finder</span>
      </span>
    </span>
  );
}
