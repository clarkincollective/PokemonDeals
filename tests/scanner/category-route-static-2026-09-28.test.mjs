// 28 Sep 2026 - owner: "Website page speeds seems a little slow". The
// category landing pages are a static, ISR-cached route behind their
// unchanged /deals/<slug> URLs (app/deal-categories/[slug]).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const { DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS } = await import("../../lib/dealCategories.js");
const STATIC = DEAL_CATEGORY_SLUGS.filter((s) => !DEAL_CATEGORIES[s]?.redirect);

test("CR-1 the static route: revalidate, no dynamic params, exactly the non-redirect category slugs, same metadata and component", () => {
  const src = read("app/deal-categories/[slug]/page.js");
  assert.match(src, /export const revalidate = 600;/);
  assert.match(src, /export const dynamicParams = false;/);
  assert.match(src, /return DEAL_CATEGORY_SLUGS\.filter\(\(slug\) => !DEAL_CATEGORIES\[slug\]\?\.redirect\)\.map\(\(slug\) => \(\{ slug \}\)\);/);
  assert.match(src, /return dealCategoryMetadata\(slug\);/, "the canonical stays /deals/<slug> (dealCategoryMetadata)");
  assert.match(src, /return <DealCategoryPage slug=\{slug\} \/>;/);
  const code = src.replace(/^\s*\/\/.*$/gm, ""); // the header comment names the very APIs it avoids
  assert.doesNotMatch(code, /searchParams|headers\(\)|cookies\(\)|no-store/, "nothing request-bound, or the route would go dynamic again");
  assert.equal(STATIC.length, 13);
  assert.ok(!STATIC.includes("japanese") && !STATIC.includes("sealed"), "the redirect slugs stay on /deals/[id]");
});

test("CR-2 next.config: /deals/<category> is rewritten to the static route before the filesystem; the internal path 308s back", () => {
  const cfg = read("next.config.mjs");
  assert.match(cfg, /import \{ DEAL_CATEGORIES, DEAL_CATEGORY_SLUGS \} from "\.\/lib\/dealCategories\.js";/, "the slug list is the category module's own");
  assert.match(cfg, /beforeFiles: \[\{ source: `\/deals\/\$\{STATIC_CATEGORY_PATTERN\}`, destination: "\/deal-categories\/:slug" \}\]/);
  assert.match(cfg, /source: `\/deal-categories\/\$\{STATIC_CATEGORY_PATTERN\}`, destination: "\/deals\/:slug", permanent: true/);
  // a numeric deal id can never match the pattern (it is an explicit slug alternation)
  const pattern = new RegExp(`^(${STATIC.join("|")})$`);
  assert.ok(!pattern.test("46166") && pattern.test("graded") && pattern.test("under-50") && !pattern.test("sealed"));
});

test("CR-3 the old route still serves a category if asked directly (fallback), and the deal detail keeps its R3 note", () => {
  const old = read("app/deals/[id]/page.js");
  assert.match(old, /if \(DEAL_CATEGORIES\[id\]\) return <DealCategoryPage slug=\{id\} \/>;/);
  assert.match(old, /omit generateStaticParams/, "the R3 workaround on the deal detail route is untouched");
  assert.match(read("lib/dealCategories.js"), /^(?!.*^import ).*$/ms, "lib/dealCategories imports nothing, so next.config can import it");
});
