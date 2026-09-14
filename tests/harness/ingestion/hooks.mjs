// Module-resolution hooks for running the REAL Next route handlers under
// plain Node, offline. "@/..." resolves to the repo; the provider modules
// (eBay, PokemonPriceTracker, FX, the Supabase client, the PokeDealFinder
// board) and next/cache resolve to local stubs. Nothing else is replaced.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const STUB = (f) => pathToFileURL(join(HERE, "stubs", f)).href;

const OVERRIDES = {
  "@/lib/ebay": STUB("ebay.mjs"),
  "@/lib/pokemonPriceTracker": STUB("ppt.mjs"),
  "@/lib/fx": STUB("fx.mjs"),
  "@/lib/supabaseAdmin": STUB("supabaseAdmin.mjs"),
  "@/lib/pokeFeed": STUB("pokeFeed.mjs"),
  "next/cache": STUB("nextCache.mjs"),
};

export async function resolve(specifier, context, nextResolve) {
  if (OVERRIDES[specifier]) return { url: OVERRIDES[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const base = join(REPO, specifier.slice(2));
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, "index.js")]) {
      if (existsSync(candidate) && !candidate.endsWith("\\") && /\.(m?js)$/.test(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
