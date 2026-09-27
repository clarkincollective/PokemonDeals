// Deal 42912 (owner-reported 27 Sep 2026): "Special Delivery Pikachu Gold
// Foil SWSH074 ..." - a gold-plate novelty of a paper promo, $300 against a
// $461 reference, on Best Finds. Three gaps, each pinned here:
//   1. the title phrase list needed "gold foil CARD"; the seller wrote
//      "Gold Foil SWSH074";
//   2. Stage 2 (vision) had returned nothing since 21 Sep and the stored
//      reason said only "vision_unavailable" - no cause;
//   3. a vision-unavailable stamp counted as a screen for 21 days.
//
//   node --test tests/scanner/authenticity-gold-foil-2026-09-27.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const dm = require("../../lib/dealMatching.js");
const va = require("../../lib/visualAuthenticity.js");

const SWSH074 = { name: "Special Delivery Pikachu - SWSH074", set: "SWSH: Sword & Shield Promo Cards", rarity: "Promo" };

test("GF-1 'gold foil' on a paper printing is a novelty admission; on a genuine gold treatment it is not", () => {
  assert.equal(dm.admitsProxyOrCounterfeit({ title: "Special Delivery Pikachu Gold Foil SWSH074 SWSH: Sword & Shield Promo Cards Holo" }, SWSH074), true, "deal 42912's exact title");
  assert.equal(dm.admitsProxyOrCounterfeit({ title: "Special Delivery Pikachu SWSH074 Holo Promo NM" }, SWSH074), false, "the genuine listing shape");
  // genuine gold treatments keep their sellers' wording
  assert.equal(dm.admitsProxyOrCounterfeit({ title: "Ultra Necrozma GX 78/70 Dragon Majesty Gold Foil Secret Rare" }, { name: "Ultra Necrozma GX", set: "Dragon Majesty", rarity: "Secret Rare" }), false);
  assert.equal(dm.admitsProxyOrCounterfeit({ title: "Arceus VSTAR 184/172 Gold Foil Hyper Rare" }, { name: "Arceus VSTAR", set: "Brilliant Stars", rarity: "Hyper Rare" }), false);
  assert.equal(dm.admitsProxyOrCounterfeit({ title: "Mew Celebrations Metal Card gold foil" }, { name: "Mew (Celebrations Metal Card)", set: "Celebrations", rarity: "Promo" }), false);
  // no card context -> conservative, no reject
  assert.equal(dm.admitsProxyOrCounterfeit({ title: "Pikachu Gold Foil" }, null), false);
  // an explicit disclaimer still wins
  assert.equal(dm.admitsProxyOrCounterfeit({ title: "Special Delivery Pikachu SWSH074 - 100% genuine, not a gold foil replica" }, SWSH074), false);
});

test("GF-2 a failed Stage 2 records WHY, keeps the vision_unavailable token, and is retried within hours rather than weeks", async () => {
  const png = Buffer.alloc(0);
  const row = { image_url: "https://i.ebayimg.com/images/g/x/s-l1600.jpg", card_name: "Special Delivery Pikachu", card_set: "SWSH Promo", card_rarity: "Promo" };
  const out = await va.screenDeal({ row, canonicalUrl: "https://tcgplayer-cdn.tcgplayer.com/product/227646_in_1000x1000.jpg" }, {
    fetchImage: async () => png,
    vision: async () => ({ unavailable: "http_402 credit balance too low" }),
  });
  assert.equal(out.status, "UNKNOWN");
  assert.match(out.reason, /vision_unavailable:http_402 credit balance too low/);
  // the legacy null return still yields the bare token
  const legacy = await va.screenDeal({ row, canonicalUrl: "https://tcgplayer-cdn.tcgplayer.com/x.jpg" }, { fetchImage: async () => png, vision: async () => null });
  assert.match(legacy.reason, /\| vision_unavailable$/);
  const src = read("app/api/screen-visual-authenticity/route.js");
  assert.match(src, /const VISION_RETRY_HOURS = 6;/);
  assert.match(src, /visual_authenticity_reason"/, "the queue reads the reason");
  assert.match(src, /if \(\/vision_unavailable\/\.test\(String\(row\.visual_authenticity_reason \?\? ""\)\)\) return at > retryCutoff;/);
  assert.match(src, /if \(recentlyScreened\(row\)\) continue;/);
  const lib = read("lib/visualAuthenticity.js");
  assert.match(lib, /return \{ unavailable: `http_\$\{res\.status\}/, "an HTTP failure carries its status into the reason");
  assert.match(lib, /if \(!key\) return \{ unavailable: "no_key" \};/);
});
