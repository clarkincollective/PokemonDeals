// SOCIAL-LIVE-3: daily autopilot - slots, duplicate protection, story bank, copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planSlotGroups, STORY_SLOTS, brisbaneLabel, autopilotPlatforms, manualPlatforms } from "../../lib/social/autopilot/slots.mjs";
import { slotsBooked } from "../../lib/newsroom/backlogRefill.mjs";
import { topByMarket, buildCatalogueStory, candidateQueue, GUIDE_STORIES, catalogueEligible, AUTOPILOT_SERIES } from "../../lib/social/autopilot/stories.mjs";
import { storyCaptions, renderStoryImageHtml, renderStoryScenesHtml } from "../../lib/social/autopilot/creative.mjs";
import { refillConsiderable } from "../../lib/social/newsroom/refill.mjs";

const NOW = Date.parse("2026-09-14T10:00:00Z"); // 20:00 Brisbane

// ALL = the slot grid itself, with no feed held back for manual production.
// Pinned explicitly so this test states the cadence contract and does not move
// when the owner changes which feeds they write by hand.
const ALL = { SOCIAL_AUTOPILOT_MANUAL_PLATFORMS: "" };

test("SL3-1 slot groups: two story slots a day, Brisbane times, 65 min lead, 48 h horizon", () => {
  const g = planSlotGroups({ now: NOW, horizonHours: 48, env: ALL });
  assert.deepEqual(g.map((x) => x.key), ["2026-09-15|A", "2026-09-15|B", "2026-09-16|A", "2026-09-16|B"]);
  assert.equal(brisbaneLabel(g[0].times.x), "2026-09-15 08:00 AEST");
  assert.equal(brisbaneLabel(g[0].times.instagram), "2026-09-15 10:00 AEST");
  assert.equal(brisbaneLabel(g[1].times.youtube), "2026-09-15 20:00 AEST");
  const soon = planSlotGroups({ now: Date.parse("2026-09-14T21:30:00Z"), horizonHours: 48, env: ALL }); // 07:30 Brisbane
  assert.ok(!("x" in soon[0].times), "08:00 is inside the 65 min lead");
  assert.ok("instagram" in soon[0].times);
  assert.deepEqual(Object.keys(STORY_SLOTS.A).sort(), ["instagram", "tiktok", "x", "youtube"]);
});

test("SL3-1b a manually produced feed is planned no slot; the rest keep their times; the shipped default pauses all four", () => {
  const manual = { SOCIAL_AUTOPILOT_MANUAL_PLATFORMS: "instagram" };
  const g = planSlotGroups({ now: NOW, horizonHours: 48, env: manual });
  // same groups, same hours for everyone else - only Instagram disappears
  assert.deepEqual(g.map((x) => x.key), ["2026-09-15|A", "2026-09-15|B", "2026-09-16|A", "2026-09-16|B"]);
  for (const grp of g) assert.ok(!("instagram" in grp.times), `${grp.key} still plans an Instagram slot`);
  assert.deepEqual(Object.keys(g[0].times).sort(), ["tiktok", "x", "youtube"]);
  assert.equal(brisbaneLabel(g[0].times.x), "2026-09-15 08:00 AEST");
  assert.equal(brisbaneLabel(g[0].times.tiktok), "2026-09-15 11:30 AEST");
  assert.equal(brisbaneLabel(g[1].times.youtube), "2026-09-15 20:00 AEST");
  // SHIPPED DEFAULT, 2026-09-18: all four feeds are produced by hand, so
  // autopilot owns nothing and plans no slot at all.
  assert.deepEqual(autopilotPlatforms({}), []);
  for (const p of ["x", "instagram", "tiktok", "youtube"]) assert.ok(manualPlatforms({}).has(p), `${p} must be paused`);
  assert.equal(planSlotGroups({ now: NOW, horizonHours: 48 }).length, 0, "a fully paused site plans no slot groups");
  // and it is reversible without a deploy
  assert.deepEqual(autopilotPlatforms(ALL), ["x", "instagram", "tiktok", "youtube"]);
});

test("SL3-2 a booked feed slot (queued, submitting, published or with a provider ref) is never re-booked", () => {
  const t = "2026-09-15T00:00:00.000Z";
  const b = slotsBooked([
    { platform: "x", scheduled_for: t, status: "BUFFER_QUEUED" },
    { platform: "instagram", scheduled_for: t, status: "BUFFER_SUBMITTING" },
    { platform: "tiktok", scheduled_for: t, status: "QA_WATCH" },
    { platform: "youtube", scheduled_for: t, status: "QA_WATCH", buffer_provider_ref: "abc" },
  ]);
  assert.ok(b.has(`x|${Date.parse(t)}`) && b.has(`instagram|${Date.parse(t)}`) && b.has(`youtube|${Date.parse(t)}`));
  assert.ok(!b.has(`tiktok|${Date.parse(t)}`));
  const src = readFileSync("lib/newsroom/backlogRefill.mjs", "utf8");
  assert.match(src, /bookedSlots\.has\(`\$\{e\.p\.platform\}\|\$\{Date\.parse\(cand\)\}`\)/);
  const ap = readFileSync("scripts/socialAutopilot.mjs", "utf8");
  assert.match(ap, /!booked\.has\(`\$\{p\}\|\$\{Date\.parse\(t\)\}`\)/);
  const reserved = slotsBooked([{ platform: "x", status: "AUTOPILOT_READY", planned_for: t }]);
  assert.ok(reserved.has(`x|${Date.parse(t)}`), "a reserved autopilot slot counts as booked");
});

const row = (id, name, price, extra = {}) => ({ tcgplayer_id: id, name, set: "SM - Team Up", card_number: "1/2", image_url: "u", market_price: price, market_condition: "Near Mint", market_printing: "Holofoil", language: "english", ...extra });

test("SL3-3 catalogue picks: Near Mint, English, no specialty / promo bins, no edition-ambiguous prices, no recently shown card", () => {
  const rows = [row("1", "A", 900), row("2", "B", 800, { market_condition: "Lightly Played" }), row("3", "C", 700, { set: "Jumbo Cards" }), row("4", "D", 600, { set: "SM Promos" }),
    row("5", "E", 500, { market_printing: "1st Edition Holofoil" }), row("6", "F", 400, { language: "japanese" }), row("7", "G", 300), row("8", "H", 200), row("9", "I", 100)];
  assert.deepEqual(topByMarket(rows, 3).map((r) => r.tcgplayer_id), ["1", "7", "8"]);
  assert.deepEqual(topByMarket(rows, 3, { excludeIds: new Set(["7"]) }).map((r) => r.tcgplayer_id), ["1", "8", "9"]);
  assert.equal(catalogueEligible(row("10", "J", 5, { name: "Charizard (Oversized)" })), false);
});

test("SL3-4 catalogue stories are dated market references, never sales; ambiguous checklist sets drop prices", () => {
  const rows = [row("1", "A", 900), row("2", "B", 800), row("3", "C", 700)];
  const s = buildCatalogueStory("set", "SM - Team Up", rows, { asOf: NOW }).story;
  assert.equal(s.href, "/sets/sm-team-up");
  assert.match(s.sub, /Near Mint singles, as of 14 Sept 2026/);
  for (const kind of ["set", "species", "checklist"]) {
    const st = buildCatalogueStory(kind, kind === "species" ? "Pikachu" : "Gym Heroes", rows, { asOf: NOW }).story;
    assert.doesNotMatch(`${st.headline} ${st.sub} ${st.note}`, /\bsells?\b|\bsold\b/i);
  }
  const amb = [row("1", "A", 900, { market_printing: "Unlimited Holofoil" }), row("2", "B", 800, { market_printing: "Unlimited Holofoil" }), row("3", "C", 700, { market_printing: "1st Edition Holofoil" })];
  const c = buildCatalogueStory("checklist", "Gym Heroes", amb, { asOf: NOW });
  assert.ok(c.ok);
  assert.ok(c.story.cards.every((x) => x.market_usd == null));
  assert.equal(buildCatalogueStory("set", "Gym Challenge", amb, { asOf: NOW }).ok, false);
  // a "three highest" story never substitutes a recently featured top card
  const four = [row("1", "A", 900), row("2", "B", 800), row("3", "C", 700), row("4", "D", 600)];
  const deferred = buildCatalogueStory("species", "Gardevoir", four, { asOf: NOW, excludeIds: new Set(["2"]) });
  assert.equal(deferred.ok, false);
  assert.match(deferred.reason, /featured recently/);
  const cl = buildCatalogueStory("checklist", "Fossil", four, { asOf: NOW, excludeIds: new Set(["2"]) });
  assert.ok(cl.ok && cl.story.cards.every((x) => x.market_usd == null), "a substituted checklist trio drops the ranking prices");
});

test("SL3-5 the rotation never repeats a story inside the cooldown and alternates kinds", () => {
  const q = candidateQueue({ used: new Set(["guide:two-numbers", "checklist:Jungle"]), dayIndex: 3 });
  const keys = q.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(!keys.includes("guide:two-numbers") && !keys.includes("checklist:Jungle"));
  assert.notEqual(q[0].kind, q[1].kind);
  assert.ok(q.length >= 50, `supply ${q.length}`);
});

test("SL3-6 captions fit each platform and keep the attributed site link; autopilot series stay out of Stage B", () => {
  const story = { ...GUIDE_STORIES[1], kind: "guide" };
  const cap = storyCaptions(story, { storyId: "autopilot-2026-09-15-A" });
  assert.ok(cap.x.text.length <= 280, `x ${cap.x.text.length}`);
  assert.match(cap.x.text, /pokemondealfinder\.com\/guides\/how-to-find-pokemon-card-set-and-number\?utm_source=x/);
  assert.ok(cap.youtube.youtubeTitle.length <= 100 && /#shorts$/.test(cap.youtube.youtubeTitle));
  assert.ok(cap.tiktok.tiktokTitle.length <= 90);
  assert.match(cap.instagram.siteLink, /utm_source=instagram/);
  for (const s of Object.values(AUTOPILOT_SERIES)) assert.equal(refillConsiderable(s), false);
  const html = renderStoryImageHtml(story, { art: { 246720: "file:///a.jpg", 246722: "file:///b.jpg", 246723: "file:///c.jpg" } });
  assert.doesNotMatch(html.replace(/@font-face[\s\S]*?\}/g, ""), /Pokémon/);
  const scenes = renderStoryScenesHtml(story, { art: {} });
  assert.deepEqual(scenes.map((x) => x.id), ["hook", "card0", "card1", "card2", "end"]);
});

test("SL3-7 queue + health + alerts run on Vercel (production env), rendering on GitHub; no Buffer secret in CI", () => {
  const ops = readFileSync("lib/social/autopilot/ops.mjs", "utf8");
  assert.match(ops, /status: "BUFFER_SUBMITTING", scheduled_for: p\.planned_for/);
  assert.match(ops, /env\.SOCIAL_ALERT_EMAIL/);
  assert.match(ops, /qa_type", "SOCIAL_ALERT"/);
  assert.match(ops, /empty posting slots in the next 24 h/);
  const vj = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.ok(vj.crons.some((c) => c.path === "/api/social-autopilot-queue" && c.schedule === "25 * * * *"));
  assert.ok(vj.crons.some((c) => c.path === "/api/social-health"));
  for (const r of ["app/api/social-autopilot-queue/route.js", "app/api/social-health/route.js"]) assert.match(readFileSync(r, "utf8"), /Bearer \$\{process\.env\.CRON_SECRET\}/);
  const wf = readFileSync(".github/workflows/social-autopilot.yml", "utf8");
  assert.match(wf, /cron: "15 17,5 \* \* \*"/);
  assert.doesNotMatch(wf, /BUFFER_ACCESS_TOKEN|CRON_SECRET/);
  assert.match(readFileSync("scripts/socialAutopilot.mjs", "utf8"), /status: "AUTOPILOT_READY", planned_for: dueAt/);
});

test("SL3-8 TikTok public check normalises Buffer's bare tiktok.com URL (oEmbed needs www)", async () => {
  const { verifyPublicPost } = await import("../../lib/social/autopilot/publicCheck.mjs");
  let asked = "";
  const fetchImpl = async (u) => { asked = u; return { ok: true, json: async () => ({ author_unique_id: "pokemondealfinder", thumbnail_url: "t", thumbnail_width: 576, thumbnail_height: 1024 }) }; };
  const r = await verifyPublicPost("tiktok", "https://tiktok.com/@pokemondealfinder/video/1", { fetchImpl });
  assert.equal(r.ok, true);
  assert.match(decodeURIComponent(asked), /url=https:\/\/www\.tiktok\.com\/@pokemondealfinder\/video\/1/);
});

test("SL3-9 health reads only due posts and does not page on a transient Buffer rate limit", () => {
  const ops = readFileSync("lib/social/autopilot/ops.mjs", "utf8");
  assert.match(ops, /if \(Number\.isFinite\(dueAt\) && dueAt > now\) continue;/);
  assert.match(ops, /st\.reason === "buffer_rate_limited" && now - dueAt < 6 \* 3_600_000/);
});

test("SL4-1 an explicit pause withdraws only not-yet-due autopilot posts from Buffer; a failed withdrawal alerts", async () => {
  const { pauseWithdrawals, WITHDRAW_MIN_LEAD_MINUTES } = await import("../../lib/social/autopilot/ops.mjs");
  const now = Date.parse("2026-09-15T12:00:00Z");
  const at = (min) => new Date(now + min * 60_000).toISOString();
  const rows = [
    { placement_id: "a", story_id: "autopilot-2026-09-16-A", status: "BUFFER_QUEUED", buffer_provider_ref: "b1", scheduled_for: at(600) },
    { placement_id: "soon", story_id: "autopilot-2026-09-16-A", status: "BUFFER_QUEUED", buffer_provider_ref: "b2", scheduled_for: at(WITHDRAW_MIN_LEAD_MINUTES - 1) },
    { placement_id: "stageB", story_id: "stageb-story", status: "BUFFER_QUEUED", buffer_provider_ref: "b3", scheduled_for: at(600) },
    { placement_id: "sent", story_id: "autopilot-2026-09-15-A", status: "PUBLISHED", buffer_provider_ref: "b4", scheduled_for: at(-60) },
    { placement_id: "noref", story_id: "autopilot-2026-09-16-B", status: "BUFFER_QUEUED", buffer_provider_ref: null, scheduled_for: at(600) },
    { placement_id: "submitting", story_id: "autopilot-2026-09-16-B", status: "BUFFER_SUBMITTING", buffer_provider_ref: null, scheduled_for: at(600) },
  ];
  assert.deepEqual(pauseWithdrawals(rows, { now }).map((p) => p.placement_id), ["a"]);
  const ops = readFileSync("lib/social/autopilot/ops.mjs", "utf8");
  assert.match(ops, /const explicitPause = circuit\.state === "OWNER_SUSPENDED" \|\| posture\.kill === true;/, "never on an unreadable circuit, an automatic trip or a config gap");
  assert.match(ops, /if \(d\?\.ok && d\.deleted\) \{/);
  assert.match(ops, /status: "AUTOPILOT_READY", buffer_provider_ref: null, scheduled_for: null, provider_state: "WITHDRAWN_BY_PAUSE"/);
  assert.match(ops, /is still queued in Buffer/);
  // the provider refuses to delete a post that has already sent
  assert.match(readFileSync("lib/social/providers/buffer.mjs", "utf8"), /refusing_to_delete_sent_post/);
});

test("SL4-2 only a Buffer 429 (nothing created) is retried, at most 3 attempts; uncertain outcomes are never blind-retried", async () => {
  const { rejectionOutcome, MAX_QUEUE_ATTEMPTS } = await import("../../lib/social/autopilot/ops.mjs");
  assert.equal(MAX_QUEUE_ATTEMPTS, 3);
  assert.deepEqual(rejectionOutcome({ reason: "buffer_rate_limited" }, undefined), { retry: true, attempts: 1, status: "AUTOPILOT_READY" });
  assert.deepEqual(rejectionOutcome({ reason: "buffer_rate_limited" }, 1), { retry: true, attempts: 2, status: "AUTOPILOT_READY" });
  assert.deepEqual(rejectionOutcome({ reason: "buffer_rate_limited" }, 2), { retry: false, attempts: 3, status: "QA_WATCH" });
  for (const reason of ["buffer_network_timeout", "buffer_network_exception", "buffer_http_502", "buffer_error", "buffer_InvalidInputError"]) {
    assert.equal(rejectionOutcome({ reason }, 0).retry, false, reason);
  }
  const ops = readFileSync("lib/social/autopilot/ops.mjs", "utf8");
  assert.match(ops, /caption_style: \{ \.\.\.cap, queue_attempts: next\.attempts \}/, "the attempt count persists across invocations");
  // the crash marker still precedes every provider submit
  assert.ok(ops.indexOf('status: "BUFFER_SUBMITTING"') < ops.indexOf("prov.createPost("));
});

test("SL4-3 the story bank sustains two stories a day through its cooldown", async () => {
  const { SPOTLIGHT_SETS, SPOTLIGHT_SPECIES, STORY_COOLDOWN_DAYS } = await import("../../lib/social/autopilot/stories.mjs");
  const { CHECKLIST_SETS } = await import("../../lib/setChecklist.js");
  const keys = candidateQueue({ used: new Set(), dayIndex: 0 }).length;
  assert.equal(keys, GUIDE_STORIES.length + CHECKLIST_SETS.length + SPOTLIGHT_SETS.length + SPOTLIGHT_SPECIES.length);
  assert.ok(keys >= 2 * STORY_COOLDOWN_DAYS * 1.25, `${keys} keys for a ${STORY_COOLDOWN_DAYS}-day cooldown at 2/day (25% margin for deferred stories)`);
  assert.equal(new Set(SPOTLIGHT_SETS).size, SPOTLIGHT_SETS.length);
  assert.equal(new Set(SPOTLIGHT_SPECIES).size, SPOTLIGHT_SPECIES.length);
  for (const s of SPOTLIGHT_SETS) assert.ok(!CHECKLIST_SETS.includes(s), `${s} is not also a checklist story`);
  // repeats still wait out the card cooldown
  assert.match(readFileSync("scripts/socialAutopilot.mjs", "utf8"), /NOW - 21 \* 86_400_000/);
});
