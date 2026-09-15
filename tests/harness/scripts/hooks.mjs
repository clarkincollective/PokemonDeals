// Module-resolution hooks for tests/harness/scripts/register.mjs.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OVERRIDES = {
  dotenv: pathToFileURL(join(HERE, "stubs", "dotenv.mjs")).href,
  "@supabase/supabase-js": pathToFileURL(join(HERE, "stubs", "supabase.mjs")).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (OVERRIDES[specifier]) return { url: OVERRIDES[specifier], shortCircuit: true };
  return nextResolve(specifier, context);
}
