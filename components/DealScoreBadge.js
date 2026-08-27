// Renders the {label, className} object produced by lib/dealScore.js -
// deliberately NOT a numeric "94/100" score. That threshold-based label
// (Amazing/Strong/Good Deal, based purely on real discount_pct) is the
// most honest "deal quality" signal we can show without fabricating a
// composite formula dressed up as precision. The tooltip says exactly
// what it's based on so it never implies more than it is - this is also
// the deliberate seam for a real numeric score later, if the data ever
// justifies one.
export default function DealScoreBadge({ score, size = "md", className = "" }) {
  if (!score) return null;

  const sizeClasses = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-bold ${sizeClasses} ${score.className} ${className}`}
      title="Deal quality is based on how far below real market price this listing is."
    >
      {score.label}
    </span>
  );
}
