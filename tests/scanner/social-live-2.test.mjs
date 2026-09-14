// SOCIAL-LIVE-2: no fabricated sold evidence; classified image API errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyImageApiError, sanitiseApiText } from "../../lib/newsroom/hybrid/openaiError.mjs";
import { generateFullSocial } from "../../lib/newsroom/hybrid/fullGenerative.mjs";
import { SOLD_OBSERVATIONS_STORED } from "../../lib/social/newsroom/marketData.mjs";
import { askingVsSold } from "../../lib/social/newsroom/cardEditorialTemplates.mjs";

test("SL2-1 the asking-vs-sold resolver never synthesises sold points and is withheld without stored sales", () => {
  const src = readFileSync("lib/social/newsroom/marketData.mjs", "utf8");
  assert.doesNotMatch(src, /market \* 0\.96|market \* 1\.04/);
  assert.equal(SOLD_OBSERVATIONS_STORED, false);
  assert.match(src, /if \(!SOLD_OBSERVATIONS_STORED\) return UNDER\(/);
});

test("SL2-2 the template shows the real ask and labels the market reference as a reference", () => {
  const html = askingVsSold({ askingUsd: 41.5, marketRefUsd: 80, soldPoints: [], card: { name: "Pikachu", set: "Base" } });
  assert.match(html, /This listing asks/);
  assert.match(html, /Market reference/);
  assert.doesNotMatch(html, /Recent sold/);
  assert.doesNotMatch(html, /\$108/); // the old fabricated 1.35x ask
  assert.match(html, /\$41\.5|\$42/);
});

test("SL2-3 market-shape wording never calls a market price a sale", () => {
  for (const f of ["lib/social/newsroom/cardEditorialTemplates.mjs", "lib/newsroom/hybrid/freeformRenderer.mjs", "lib/newsroom/hybrid/fullGenerative.mjs", "lib/newsroom/video/videoDirector.mjs", "lib/newsroom/hybrid/semanticManifest.mjs", "lib/newsroom/discovery/platformPackagers.mjs"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /sell under \$25|sell for under|share selling under|over what it actually sells for/, f);
  }
  assert.doesNotMatch(readFileSync("lib/newsroom/hybrid/primitives.mjs", "utf8"), /label\("Recent sold range"/);
});

test("SL2-4 safety refusals are classified apart from invalid requests, sanitised", () => {
  const refusal = classifyImageApiError({ status: 400, body: JSON.stringify({ error: { message: "Your request was rejected by the safety system.", type: "image_generation_user_error", code: "moderation_blocked" } }), requestId: "req_abc" });
  assert.equal(refusal.kind, "safety_refusal");
  assert.equal(refusal.retryable, false);
  assert.equal(refusal.request_id, "req_abc");
  const invalid = classifyImageApiError({ status: 400, body: JSON.stringify({ error: { message: "Invalid size", type: "invalid_request_error", param: "size" } }) });
  assert.equal(invalid.kind, "invalid_request");
  assert.equal(invalid.param, "size");
  assert.equal(classifyImageApiError({ status: 429, body: "slow down" }).retryable, true);
  assert.doesNotMatch(sanitiseApiText("key sk-abcdefghijklmnop and Bearer xyz.123"), /abcdefghijklmnop|xyz\.123/);
});

test("SL2-5 a safety refusal is never re-sent on the previous model; an invalid request may be", async () => {
  const card = "package.json"; // any existing file stands in for a card image
  const run = async (errBody) => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: false, status: 400, headers: { get: () => "req_x" }, text: async () => errBody }; };
    const r = await generateFullSocial({ prompt: "p", cardImagePaths: [card], env: { OPENAI_API_KEY: "k" }, fetchImpl });
    return { r, calls };
  };
  const refused = await run(JSON.stringify({ error: { message: "rejected by the safety system", code: "moderation_blocked" } }));
  assert.equal(refused.calls, 1);
  assert.equal(refused.r.availability, "safety_refusal");
  assert.equal(refused.r.error.kind, "safety_refusal");
  const invalid = await run(JSON.stringify({ error: { message: "bad param", type: "invalid_request_error" } }));
  assert.equal(invalid.calls, 2);
  assert.equal(invalid.r.error.kind, "invalid_request");
});

test("SL2-6 a World Championship deck / jumbo copy is never a social deal against a standard printing", async () => {
  const { specialtyCopyMismatch } = await import("../../lib/social/newsroom/marketData.mjs");
  assert.equal(specialtyCopyMismatch({ title: "Solgaleo GX SM104 2019 World Championships Henry Brand Pokemon WC NM", card_set: "SM Promos" }), true);
  assert.equal(specialtyCopyMismatch({ title: "Charizard Jumbo Oversized Promo", card_set: "Sword & Shield Promos" }), true);
  assert.equal(specialtyCopyMismatch({ title: "Zeraora GX Full Art Holo Ultra Rare 201/214 Sm-Lost Thunder", card_set: "SM - Lost Thunder" }), false);
  assert.equal(specialtyCopyMismatch({ title: "Pikachu 2004 World Championships deck", card_set: "World Championship Decks" }), false);
});

test("SL2-7 the market-shape example is a catalogue printing under $25 (not a live listing), rotating weekly", async () => {
  const { pickUnder25Example } = await import("../../lib/social/newsroom/marketData.mjs");
  const row = (id, name, price, extra = {}) => ({ tcgplayer_id: id, name, set: "S", image_url: "u", market_price: price, market_condition: "Near Mint", market_printing: "Holofoil", language: "english", ...extra });
  const rows = [row("1", "Pikachu", 20), row("2", "Umbreon", 24), row("3", "Rattata", 24), row("4", "Eevee", 30), row("5", "Mew", 22, { market_condition: "Lightly Played" }), row("6", "Charizard", 23, { market_printing: "1st Edition Holofoil" })];
  const picks = new Set([0, 1, 2, 3].map((w) => pickUnder25Example(rows, { now: w * 7 * 86_400_000 })?.tcgplayer_id));
  assert.deepEqual([...picks].sort(), ["1", "2"]);
  assert.equal(pickUnder25Example([row("3", "Rattata", 24)]), null);
  const html = (await import("../../lib/social/newsroom/cardEditorialTemplates.mjs")).renderCardEditorialHtml("market_shape", { pricedCards: 24674, under25Pct: 85.7, over100Pct: 4.7, featured: { kind: "catalog_example", tcgplayerId: "2", card_name: "Umbreon", card_set: "S", market_ref_usd: 24, market_condition: "Near Mint", asking_usd: null } });
  assert.match(html, /One example under \$25/);
  assert.match(html, /market reference/);
  assert.doesNotMatch(html, /Standout deal|line-through/);
});
