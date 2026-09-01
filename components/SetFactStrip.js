// Compact set-identity context near the top of every /sets/[slug]
// render. Real data only: how many cards we track, distinct rarities,
// and a coarse era label ONLY when it comes from the curated
// vintage / SV-SWSH lists (no release dates are fabricated).
export default function SetFactStrip({ setName, snapshot, era = null }) {
  if (!snapshot) return null;
  const dot = <span className="text-zinc-300 dark:text-zinc-600">·</span>;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="font-semibold text-zinc-500 dark:text-zinc-400">
        {snapshot.cardCount} {snapshot.cardCount === 1 ? "card" : "cards"} tracked
      </span>
      {snapshot.rarityCount > 0 && (
        <>
          {dot}
          <span>
            {snapshot.rarityCount} {snapshot.rarityCount === 1 ? "rarity" : "rarities"}
          </span>
        </>
      )}
      {era && (
        <>
          {dot}
          <span>{era}</span>
        </>
      )}
    </div>
  );
}
