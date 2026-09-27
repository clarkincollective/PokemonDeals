// Module-resolution hooks for running the REAL route handlers under plain
// Node on the owner's PC (scripts/crons/runJob.mjs). "@/..." resolves to the
// repo, and `next/cache` to the shim that collects revalidations for the
// site. NOTHING ELSE is replaced: the eBay, PokemonPriceTracker, FX and
// Supabase clients are the production modules against the production
// services, exactly as on Vercel. (The test harness in tests/harness has the
// same shape with providers stubbed - this is its production counterpart.)
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SHIM = pathToFileURL(join(HERE, "nextCacheShim.mjs")).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/cache") return { url: SHIM, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const base = join(REPO, specifier.slice(2));
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, "index.js")]) {
      if (existsSync(candidate) && /\.(m?js)$/.test(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
