// cache-retire-r1 - module hooks for the offline cache scenario: the REAL
// lib/deals.js loaders and API routes, with next/cache replaced by the cache
// model, the Supabase clients by one in-memory database, and every provider
// module by the ingestion harness stubs (fetch is disabled).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const INGEST = (f) => pathToFileURL(join(HERE, "..", "ingestion", "stubs", f)).href;
const OVERRIDES = {
  "next/cache": pathToFileURL(join(HERE, "nextCacheModel.mjs")).href,
  "@/lib/supabaseClient": pathToFileURL(join(HERE, "supabaseStub.mjs")).href,
  "@/lib/supabaseAdmin": pathToFileURL(join(HERE, "supabaseStub.mjs")).href,
  "@/lib/ebay": INGEST("ebay.mjs"),
  "@/lib/pokemonPriceTracker": INGEST("ppt.mjs"),
  "@/lib/fx": INGEST("fx.mjs"),
  "@/lib/pokeFeed": INGEST("pokeFeed.mjs"),
};

export async function resolve(specifier, context, nextResolve) {
  if (OVERRIDES[specifier]) return { url: OVERRIDES[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const base = join(REPO, specifier.slice(2));
    for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, "index.js")]) {
      if (existsSync(candidate) && /\.(m?js)$/.test(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
