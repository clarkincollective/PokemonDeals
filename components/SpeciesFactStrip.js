import Link from "next/link";
import { speciesFacts } from "@/lib/speciesFacts";
import { speciesSlug } from "@/lib/pokemonSpecies";

// Compact species-identity context near the top of every /pokemon/[slug]
// render (deal-backed, catalogue-backed and noindex). Purely real data
// from lib/speciesFacts - a field that isn't known is simply not shown,
// never fabricated. This is what makes /pokemon/caterpie a Caterpie
// *card species hub* rather than the catalogue grid with a new name.
//
// Deliberately one dense line, not a lore block: dex number, type(s),
// generation + region, and the evolution line (relatives link to their
// own /pokemon page - species <-> species internal linking).
export default function SpeciesFactStrip({ speciesName }) {
  const f = speciesFacts(speciesName);
  if (!f) return null;

  const dot = <span className="text-zinc-300 dark:text-zinc-600">·</span>;
  const line = f.evolutionLine ?? null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
        #{String(f.dexNumber).padStart(4, "0")}
      </span>
      {f.types?.length ? (
        <>
          {dot}
          <span>{f.types.join(" / ")}</span>
        </>
      ) : null}
      {dot}
      <span>
        Generation {f.generationRoman}
        {f.generationRegion ? ` · ${f.generationRegion}` : ""}
      </span>
      {line && line.length > 1 ? (
        <>
          {dot}
          <span className="inline-flex flex-wrap items-center gap-x-1">
            {line.map((step, i) => {
              const arrow =
                i > 0 ? <span className="text-zinc-300 dark:text-zinc-600">→</span> : null;
              if (Array.isArray(step)) {
                return (
                  <span key={`branch-${i}`} className="inline-flex flex-wrap items-center gap-x-1">
                    {arrow}
                    {step.map((name, j) => (
                      <span key={name} className="inline-flex items-center gap-x-1">
                        {j > 0 && <span className="text-zinc-400">/</span>}
                        <EvoName name={name} current={name === speciesName} />
                      </span>
                    ))}
                  </span>
                );
              }
              return (
                <span key={step} className="inline-flex items-center gap-x-1">
                  {arrow}
                  <EvoName name={step} current={step === speciesName} />
                </span>
              );
            })}
          </span>
        </>
      ) : null}
    </div>
  );
}

function EvoName({ name, current }) {
  if (current) {
    return <span className="font-semibold text-black dark:text-zinc-50">{name}</span>;
  }
  return (
    <Link
      href={`/pokemon/${speciesSlug(name)}`}
      className="hover:text-red-600 hover:underline dark:hover:text-red-500"
    >
      {name}
    </Link>
  );
}
