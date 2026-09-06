// Phase 13E.2 - the OpenAI image-generated BRAND ASSET LIBRARY.
// Fixtures only: no OpenAI call, no live database, no Chrome render. The
// load-bearing guarantee under test is the DATA BOUNDARY - the image
// model can never receive a card name, price, listing id, search query,
// or user identity - plus deterministic, fail-closed asset selection in
// `social:daily`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  ASSET_FAMILIES,
  STYLE_FAMILIES,
  COMPOSITION_ZONES,
  VARIANT_PLAN,
  SAMPLE_SELECTION,
  PROMPT_SPEC_VERSION,
  SHARED_NEGATIVE,
  buildAssetPrompt,
  assertDataFree,
  expandPlan,
  familySpec,
} from "../../lib/social/assetPrompts.mjs";
import {
  ASSET_CATEGORY_FOR_CONTENT_TYPE,
  QA_CHECKS,
  loadAssetManifest,
  validateAssetEntry,
  approvedAssetsForCategory,
  pickAssetForContentType,
  resolveBackgroundForPost,
  MANIFEST_PATH,
} from "../../lib/social/assets.mjs";
import { buildSlideContent, renderHtml } from "../../lib/social/templates.mjs";
import { buildDealPayload } from "../../lib/social/payload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const DAILY_CONTENT_TYPES = ["deal_of_day", "just_found", "pokemon_spotlight", "set_spotlight", "market_snapshot"];

function dealRow(over = {}) {
  const total = over.total_price_usd ?? 60;
  const market = over.market_price ?? 100;
  return {
    id: 4242,
    watchlist_id: 4242,
    card_name: "Charizard - 4/102 (Base Set)",
    card_set: "Base Set",
    is_graded: false,
    grader: null,
    grade: null,
    listing_type: "FIXED_PRICE",
    listing_id: "v1|999888777|0",
    marketplace: "EBAY_US",
    total_price: total,
    total_price_usd: total,
    market_price: market,
    discount_pct: Number((1 - total / market).toFixed(4)),
    exact_verified_at: new Date().toISOString(),
    first_seen_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    ...over,
  };
}

// === 1. the prompt pack is data-free by construction ====================

test("1. every (family × style × zone) the pack can produce passes assertDataFree", () => {
  for (const family of ASSET_FAMILIES) {
    for (const style of STYLE_FAMILIES) {
      for (const zone of COMPOSITION_ZONES) {
        const built = buildAssetPrompt({ family, style, zone });
        assert.equal(built.spec_version, PROMPT_SPEC_VERSION);
        assert.doesNotThrow(() => assertDataFree(built.prompt));
        assert.equal(built.aspect_ratio, "4:5");
      }
    }
  }
});

test("1b. the full 30-variant plan expands and every prompt is data-free", () => {
  const plan = expandPlan();
  assert.equal(plan.length, 30);
  for (const e of plan) assert.doesNotThrow(() => assertDataFree(e.prompt));
  // sample selection is exactly 10, all present in the plan
  assert.equal(SAMPLE_SELECTION.length, 10);
  for (const [f, v] of SAMPLE_SELECTION) {
    assert.ok(plan.find((e) => e.category === f && e.variant === v), `${f}/${v} in plan`);
  }
});

// === 2. no live data can be smuggled into a prompt =====================

test("2. buildAssetPrompt REJECTS any key beyond { family, style, zone }", () => {
  for (const poison of [
    { family: "deal_intelligence", card_name: "Charizard" },
    { family: "deal_intelligence", price: 120 },
    { family: "deal_intelligence", set_name: "Base Set" },
    { family: "deal_intelligence", deal_id: 31721 },
    { family: "deal_intelligence", listing_id: "v1|1|0" },
    { family: "deal_intelligence", query: "charizard psa 10" },
    { family: "deal_intelligence", distinct_id: "abc" },
    { family: "deal_intelligence", payload: { deal_data: {} } },
  ]) {
    assert.throws(() => buildAssetPrompt(poison), /unexpected key/i, JSON.stringify(poison));
  }
});

test("2b. assertDataFree CATCHES poisoned strings", () => {
  for (const bad of [
    "Charizard listed at $120 vs $158 market reference, 24% under",
    "PSA 10 copy, market ref $1388.97",
    "search query: moonbreon",
    "eBay listing itm/12345 by seller cardshark",
    "discount_pct 0.24 on watchlist_id 900",
    "This Pikachu is 30% below reference",
  ]) {
    assert.throws(() => assertDataFree(bad), /live-data signature/i, bad);
  }
});

test("2c. assertDataFree ALLOWS the pack's own brand-prohibition sentence (it names eBay/PSA only to exclude them)", () => {
  assert.doesNotThrow(() => assertDataFree(SHARED_NEGATIVE));
  assert.match(SHARED_NEGATIVE, /MUST NOT contain/);
  assert.match(SHARED_NEGATIVE, /Poke Ball/);
  assert.match(SHARED_NEGATIVE, /eBay logos or branding/);
  assert.match(SHARED_NEGATIVE, /readable text/i);
});

// === 3. copyright / IP boundary is in every prompt =====================

test("3. every family prompt carries the full IP + no-text + NO-CARD-DRAWING prohibition (13E.2.1)", () => {
  for (const family of ASSET_FAMILIES) {
    const { prompt } = buildAssetPrompt({ family });
    assert.match(prompt, /Poke Ball/);
    assert.match(prompt, /Pokemon logo or wordmark/);
    assert.match(prompt, /Nintendo, The Pokemon Company/);
    assert.match(prompt, /eBay logos or branding/);
    assert.match(prompt, /NO TEXT of any kind rendered inside the image/);
    // 13E.2.1 SS7 - emphatic no-fake-card rules + reserved empty hero zone
    assert.match(prompt, /DO NOT DRAW A TRADING CARD/);
    assert.match(prompt, /DO NOT DRAW CARD ARTWORK OR A CARD FACE/);
    assert.match(prompt, /DO NOT DRAW CREATURES, MONSTERS, OR POKEMON-LIKE CHARACTERS/);
    assert.match(prompt, /RESERVED HERO ZONE/);
    assert.match(prompt, /LEAVE THE RESERVED HERO ZONE COMPLETELY EMPTY/);
    // the old "blank card silhouettes are allowed" permission is GONE
    assert.doesNotMatch(prompt, /allowed ONLY as clearly original blank forms/);
    assert.doesNotMatch(prompt, /fanned stack of blank cards/);
    assert.doesNotMatch(prompt, /imitate|in the style of official Pokemon/i);
  }
});

// === 4. the pack modules touch no network / no env / no live data =====

test("4. assetPrompts.mjs and assets.mjs are pure: no fetch, no process.env, no OpenAI SDK/endpoint, no live-data imports", () => {
  for (const f of ["lib/social/assetPrompts.mjs", "lib/social/assets.mjs"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${f} must not fetch`);
    assert.doesNotMatch(src, /process\.env/, `${f} must not read env`);
    assert.doesNotMatch(src, /from ["']openai["']|require\(["']openai["']\)|api\.openai\.com|gpt-image-1/i, `${f} must not use the OpenAI SDK or endpoint`);
    assert.doesNotMatch(src, /from ["']\.\.\/(db|ebay|dealMatching|newsletterFlow)|from ["']\.\/(db|candidates|dailyMix|payload)\.mjs/, `${f} must not import the live-data layer`);
  }
});

// === 5. social:daily makes ZERO image-generation calls =================

test("5. scripts/socialDaily.mjs never imports the prompt pack / generator / OpenAI SDK", () => {
  const src = read("scripts/socialDaily.mjs");
  assert.doesNotMatch(src, /from ["'][^"']*assetPrompts|from ["'][^"']*socialAssets|from ["']openai["']|api\.openai\.com|gpt-image-1/i);
  assert.doesNotMatch(src, /\bfetch\s*\(/);
  // it DOES use the local read-only asset loader
  assert.match(src, /from "\.\.\/lib\/social\/assets\.mjs"/);
});

test("5b. scripts/socialAssets.mjs isolates the OpenAI call and reads the key from env only", () => {
  const src = read("scripts/socialAssets.mjs");
  // exactly one fetch, and it is the images endpoint
  const fetchCount = (src.match(/\bfetch\s*\(/g) || []).length;
  assert.equal(fetchCount, 1);
  assert.match(src, /api\.openai\.com\/v1\/images\/generations/);
  assert.match(src, /process\.env\.OPENAI_API_KEY/);
  // the key VALUE is never logged or written (mentioning the var *name* in a
  // "not configured" message is fine; interpolating the value is not)
  assert.doesNotMatch(src, /console\.\w+\([^)]*\$\{[^}]*key[^}]*\}/i);
  assert.doesNotMatch(src, /console\.\w+\(\s*key\s*[),]/);
  assert.doesNotMatch(src, /writeFileSync\([^)]*\bkey\b/i);
  // no live-data imports
  assert.doesNotMatch(src, /from ["']\.\.?\/(lib\/)?(db|candidates|dailyMix|payload|ebay|dealMatching)/);
});

// === 6. deterministic, fail-closed asset selection ====================

function fakeManifest(assets) {
  return { spec_version: PROMPT_SPEC_VERSION, assets };
}
function approvedEntry(over = {}) {
  return {
    id: over.id ?? "deal_intelligence__A",
    category: over.category ?? "deal_intelligence",
    variant: "A",
    style: "abstract_market",
    zone: "C",
    aspect_ratio: "4:5",
    render_size: "1024x1536",
    safe_zones: { zone: "C", name: "CENTER METRIC ZONE", clear: [[80, 360, 920, 620]], text: {} },
    status: "approved",
    file: `assets/social/generated/deal_intelligence/${over.id ?? "deal_intelligence__A"}.png`,
    generated_date: "2026-09-06",
    approved_date: "2026-09-06",
    qa: Object.fromEntries(QA_CHECKS.map((c) => [c, "PASS"])),
    ...over,
  };
}
const allExist = () => true;

test("6. content-type -> asset-category map covers every daily content type", () => {
  for (const ct of DAILY_CONTENT_TYPES) {
    assert.ok(ASSET_CATEGORY_FOR_CONTENT_TYPE[ct], `no mapping for ${ct}`);
    assert.ok(ASSET_FAMILIES.includes(ASSET_CATEGORY_FOR_CONTENT_TYPE[ct]));
  }
});

test("6b. only APPROVED + all-QA-PASS + file-present assets are ever selectable", () => {
  const m = fakeManifest([
    approvedEntry({ id: "deal_intelligence__A" }),
    approvedEntry({ id: "deal_intelligence__B", status: "generated" }), // not approved
    approvedEntry({ id: "deal_intelligence__C", qa: { ...Object.fromEntries(QA_CHECKS.map((c) => [c, "PASS"])), copyright_risk: "REJECT" } }),
    approvedEntry({ id: "deal_intelligence__D", status: "rejected" }),
  ]);
  const usable = approvedAssetsForCategory(m, "deal_intelligence", { existsFn: allExist });
  assert.deepEqual(usable.map((a) => a.id), ["deal_intelligence__A"]);
});

test("6c. a missing PNG on disk drops the asset (fail closed to Mode B)", () => {
  const m = fakeManifest([approvedEntry({ id: "deal_intelligence__A" })]);
  assert.equal(approvedAssetsForCategory(m, "deal_intelligence", { existsFn: () => false }).length, 0);
  assert.equal(pickAssetForContentType("deal_of_day", { manifest: m, rotationKey: "2026-09-06", existsFn: () => false }), null);
});

test("6d. selection is deterministic for a given (content type, rotation key)", () => {
  const m = fakeManifest([
    approvedEntry({ id: "deal_intelligence__A" }),
    approvedEntry({ id: "deal_intelligence__B", qa: Object.fromEntries(QA_CHECKS.map((c) => [c, "PASS"])), status: "approved", file: "assets/social/generated/deal_intelligence/deal_intelligence__B.png" }),
    approvedEntry({ id: "deal_intelligence__C", status: "approved", file: "assets/social/generated/deal_intelligence/deal_intelligence__C.png" }),
  ]);
  const pick1 = pickAssetForContentType("deal_of_day", { manifest: m, rotationKey: "2026-09-06", existsFn: allExist });
  const pick2 = pickAssetForContentType("deal_of_day", { manifest: m, rotationKey: "2026-09-06", existsFn: allExist });
  assert.equal(pick1.id, pick2.id);
  // stable but not necessarily equal across a different day
  const other = pickAssetForContentType("deal_of_day", { manifest: m, rotationKey: "2027-01-01", existsFn: allExist });
  assert.ok(["deal_intelligence__A", "deal_intelligence__B", "deal_intelligence__C"].includes(other.id));
});

test("6e. a manifest with NO approved asset yields no background (Mode B stands)", () => {
  // Synthetic all-planned/generated manifest - none approved. (The
  // committed manifest now carries human-approved assets from 13E.3C, so
  // the "nothing in rotation" property is tested against a clean fixture.)
  const m = fakeManifest([
    { ...approvedEntry({ id: "deal_intelligence__A" }), status: "planned", file: null, qa: null },
    { ...approvedEntry({ id: "just_found__A", category: "just_found" }), status: "generated" },
  ]);
  for (const ct of DAILY_CONTENT_TYPES) {
    assert.equal(pickAssetForContentType(ct, { manifest: m, rotationKey: "2026-09-06", existsFn: allExist }), null);
  }
  const payload = buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" });
  assert.equal(resolveBackgroundForPost(payload, { manifest: m, existsFn: allExist }), null);
});

test("6f. the committed manifest's approved assets ARE selectable when their file is on disk", () => {
  const { manifest } = loadAssetManifest(MANIFEST_PATH);
  const approved = manifest.assets.filter((a) => a.status === "approved");
  if (approved.length === 0) return; // nothing approved yet - nothing to assert
  // every approved entry: file path points at assets/social/approved/, all 5 QA PASS
  for (const a of approved) {
    assert.match(a.file, /^assets\/social\/approved\//, `${a.id} approved file location`);
    assert.ok(QA_CHECKS.every((c) => a.qa[c] === "PASS"), `${a.id} all QA PASS`);
  }
  // with existsFn saying the files are present, a category that has an
  // approved asset resolves one (deterministically).
  const cat = approved[0].category;
  const picked = approvedAssetsForCategory(manifest, cat, { existsFn: () => true });
  assert.ok(picked.length >= 1, `${cat} resolves an approved background`);
});

// === 7. renderer: Mode B unchanged; background overlay preserves everything ===

test("7. renderHtml with NO background is unchanged Mode B (1080x1350, no <img>, disclosure intact)", () => {
  const slide = buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }));
  const html = renderHtml(slide, { variant: "A" });
  assert.match(html, /width:\s*1080px/);
  assert.match(html, /height:\s*1350px/);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /background-image/);
  assert.match(html, /class="disclosure">Ad</);
});

test("7b. renderHtml WITH an approved background keeps the full deterministic overlay", () => {
  const slide = buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }));
  const bg = { assetId: "deal_intelligence__A", absFile: "C:/repo/assets/social/generated/deal_intelligence/deal_intelligence__A.png", zone: "C", style: "abstract_market" };
  const html = renderHtml(slide, { variant: "A", background: bg });
  // background is CSS, never an <img> tag (Mode-B image ban still holds)
  assert.match(html, /background-image:\s*url\("file:\/\/\/C:\/repo\/assets\/social\/generated\/deal_intelligence\/deal_intelligence__A\.png"\)/);
  assert.doesNotMatch(html, /<img/i);
  // canvas is still exactly the 1080x1350 frame
  assert.match(html, /width:\s*1080px/);
  assert.match(html, /height:\s*1350px/);
  // every real fact is still the deterministic overlay
  assert.match(html, /class="disclosure">Ad</);
  assert.match(html, /UNDER MARKET REF/);
  assert.match(html, /LISTED \(USD\)/);
  assert.match(html, /MARKET REF \(USD\)/);
});

test("7c. a path with spaces is percent-encoded into the file URL", () => {
  const slide = buildSlideContent(buildDealPayload({ contentType: "deal_of_day", row: dealRow(), utmCampaign: "deal_of_day" }));
  const html = renderHtml(slide, { variant: "B", background: { absFile: "C:/My Repo/assets/x y.png", zone: "A" } });
  assert.match(html, /file:\/\/\/C:\/My%20Repo\/assets\/x%20y\.png/);
});

// === 8. manifest validation + the committed seed manifest =============

test("8. validateAssetEntry catches malformed entries and passes clean ones", () => {
  assert.deepEqual(validateAssetEntry(approvedEntry()), []);
  assert.ok(validateAssetEntry({ ...approvedEntry(), category: "not_a_family" }).length);
  assert.ok(validateAssetEntry({ ...approvedEntry(), aspect_ratio: "1:1" }).length);
  assert.ok(validateAssetEntry({ ...approvedEntry(), status: "live" }).length);
  assert.ok(validateAssetEntry({ ...approvedEntry(), safe_zones: null }).length);
  assert.ok(validateAssetEntry({ ...approvedEntry(), status: "approved", qa: { copyright_risk: "PASS" } }).length); // incomplete qa
});

test("8b. the committed manifest holds its durable invariants: 30 valid assets, 3/family, generation allowed but never auto-approved, QA+approval+file gate rotation", () => {
  const { manifest, error } = loadAssetManifest(MANIFEST_PATH);
  assert.equal(error, null);

  // --- shape invariants (hold no matter how many assets have been generated) ---
  assert.equal(manifest.assets.length, 30, "10 families x 3 variants");
  assert.equal(manifest.spec_version, PROMPT_SPEC_VERSION);
  assert.match(manifest.boundary, /ZERO live eBay \/ PPT \/ card \/ price \/ listing \/ user data/);
  assert.equal(new Set(manifest.assets.map((a) => a.id)).size, 30, "no duplicate asset ids");
  for (const fam of ASSET_FAMILIES) {
    assert.equal(manifest.assets.filter((a) => a.category === fam).length, 3, fam);
    assert.equal(VARIANT_PLAN[fam].length, 3);
  }

  const VALID_STATUS = ["planned", "generated", "approved", "rejected"];
  for (const a of manifest.assets) {
    // every committed entry is structurally clean for whatever status it carries
    assert.deepEqual(validateAssetEntry(a), [], `${a.id}: ${validateAssetEntry(a).join("; ")}`);
    assert.ok(VALID_STATUS.includes(a.status), `${a.id} has an unknown status "${a.status}"`);

    if (a.status === "planned") {
      assert.equal(a.file, null, `${a.id}: a planned asset carries no file`);
    }

    if (a.status === "generated") {
      // generation IS allowed in the committed manifest, but it is never a
      // shortcut into rotation: a generated asset is not approved, has no
      // approved_date, and generation must not have forced its QA to PASS.
      assert.notEqual(a.status, "approved");
      assert.equal(a.approved_date ?? null, null, `${a.id}: a generated asset must not carry an approved_date`);
      assert.ok(a.qa && QA_CHECKS.every((c) => c in a.qa), `${a.id}: a generated asset has a full QA block`);
      assert.ok(!QA_CHECKS.every((c) => a.qa[c] === "PASS"), `${a.id}: generation must not auto-PASS every QA check`);
    }

    if (a.status === "approved") {
      // an approval is a deliberate, reviewable manifest edit: it needs a
      // real file reference and all five QA checks explicitly PASS.
      assert.equal(typeof a.file, "string");
      assert.ok(a.file, `${a.id}: an approved asset names a file`);
      assert.ok(a.qa && QA_CHECKS.every((c) => a.qa[c] === "PASS"), `${a.id}: an approved asset has all five QA checks PASS`);
    }
  }

  // counts.approved is honest. Any approved asset must have gone through
  // the full gate: a file under assets/social/approved/ + all 5 QA PASS +
  // an approved_date. (13E.3C: the human approved 12 backgrounds.)
  const approved = manifest.assets.filter((a) => a.status === "approved");
  assert.equal(manifest.counts.approved, approved.length, "counts.approved matches the real approved count");
  for (const a of approved) {
    assert.match(a.file, /^assets\/social\/approved\//, `${a.id}: approved PNGs live in assets/social/approved/`);
    assert.ok(a.qa && QA_CHECKS.every((c) => a.qa[c] === "PASS"), `${a.id}: all 5 QA PASS`);
    assert.ok(a.approved_date, `${a.id}: has an approved_date`);
    assert.ok(a.generated_file, `${a.id}: keeps its generated_file provenance`);
  }
  // and generation still never auto-approves: no `generated` asset is approved
  assert.equal(manifest.assets.filter((a) => a.status === "generated" && a.approved_date).length, 0);

  // --- rotation gate: social:daily only ever sees approved + all-QA-PASS + file-on-disk ---
  // a `generated` (un-approved) asset is NOT rotation-eligible, even if every QA check is hand-set to PASS.
  const genPass = {
    ...approvedEntry({ id: "market_watch__A", category: "market_watch" }),
    status: "generated",
    qa: Object.fromEntries(QA_CHECKS.map((c) => [c, "PASS"])),
  };
  assert.equal(
    approvedAssetsForCategory(fakeManifest([genPass]), "market_watch", { existsFn: () => true }).length,
    0,
    "a generated (un-approved) asset is never rotation-eligible"
  );

  // missing file still fails closed: approved in the manifest but absent on disk -> excluded.
  const ghost = approvedEntry({
    id: "market_watch__B",
    category: "market_watch",
    file: "assets/social/generated/market_watch/market_watch__B.png",
  });
  assert.equal(
    approvedAssetsForCategory(fakeManifest([ghost]), "market_watch", { existsFn: () => false }).length,
    0,
    "approved-but-missing-file fails closed to Mode B"
  );

  // positive control: approved + all QA PASS + file present IS eligible.
  const live = approvedEntry({
    id: "market_watch__C",
    category: "market_watch",
    file: "assets/social/generated/market_watch/market_watch__C.png",
  });
  assert.equal(
    approvedAssetsForCategory(fakeManifest([live]), "market_watch", { existsFn: () => true }).length,
    1,
    "approved + QA PASS + file present -> eligible"
  );
});

// === 9. family spec sanity ===========================================

test("9. every family has a spec with a default style+zone that are valid enums", () => {
  for (const fam of ASSET_FAMILIES) {
    const s = familySpec(fam);
    assert.ok(STYLE_FAMILIES.includes(s.defaultStyle), `${fam} defaultStyle`);
    assert.ok(COMPOSITION_ZONES.includes(s.defaultZone), `${fam} defaultZone`);
    assert.ok(s.motif && s.motif.length > 40);
  }
  assert.equal(ASSET_FAMILIES.length, 10);
});
