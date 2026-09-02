// SEO Phase 10D - approval-gated manual outreach sender. These pin the
// safety properties: DRAFT can't send, only APPROVED reaches the mailer,
// duplicates + suppression + a daily cap block sends, dry-run and test
// mode never touch a real recipient, owner-transparent wording is
// required, outgoing copy is unaccented "Pokemon", and the existing
// transactional mailer is untouched. No network in these tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  canApprove,
  canSend,
  isSuppressed,
  sentInWindow,
  alreadySentTo,
  resolveBody,
  normalizeSpelling,
  ownershipLanguageOk,
  DEFAULT_DAILY_CAP,
} from "../../lib/outreach/core.js";
import { renderMessage, withUtm } from "../../lib/outreach/render.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const RECORDS = JSON.parse(read("lib/outreach/records.json"));
const CLI = read("scripts/outreach.mjs");
const CORE = read("lib/outreach/core.js");
const RENDER = read("lib/outreach/render.js");

const emailRecord = (over = {}) => ({
  id: "t1",
  prospectName: "T",
  organisation: "example.com",
  targetPage: "https://example.com/post",
  recipient: "editor@example.com",
  contactType: "EMAIL",
  angle: "x",
  destinationUrl: "https://pokemondealfinder.com/",
  subject: "A Pokemon note",
  body: "I run PokemonDealFinder (pokemondealfinder.com). One line about your post.",
  snapshot: null,
  status: "APPROVED",
  sendLog: [],
  ...over,
});

// === 1 / 2 : DRAFT cannot send, APPROVED can =========================

test("1. a DRAFT record cannot send", () => {
  const r = canSend(emailRecord({ status: "DRAFT" }), {});
  assert.equal(r.ok, false);
  assert.match(r.reason, /not_APPROVED/);
});

test("2. an APPROVED email record passes the send gate (reaches the mailer adapter)", () => {
  assert.equal(canSend(emailRecord(), {}).ok, true);
});

// === 3 : duplicate SENT recipient/target blocked ====================

test("3. a second initial email to the same recipient + target page is blocked", () => {
  const sent = emailRecord({ id: "prev", status: "SENT", sentAt: new Date().toISOString() });
  const next = emailRecord({ id: "dup" });
  assert.equal(alreadySentTo(next, [sent, next]), true);
  const gate = canSend(next, { records: [sent, next] });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /duplicate/);
  // a different target page to the same recipient is NOT a duplicate
  const other = emailRecord({ id: "other", targetPage: "https://example.com/other" });
  assert.equal(canSend(other, { records: [sent, other] }).ok, true);
});

// === 4 : DO_NOT_CONTACT + suppression blocked =======================

test("4. DO_NOT_CONTACT status and a suppressed domain both block sending", () => {
  assert.equal(canSend(emailRecord({ status: "DO_NOT_CONTACT" }), {}).ok, false);
  const supp = [{ domain: "example.com" }];
  assert.equal(isSuppressed("editor@example.com", supp), true);
  const gate = canSend(emailRecord(), { suppression: supp });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /suppressed/);
  assert.equal(canApprove(emailRecord({ status: "DRAFT" }), { suppression: supp }).ok, false);
});

// === 5 : daily cap ==================================================

test("5. the daily send cap is enforced", () => {
  const now = Date.now();
  const recent = Array.from({ length: DEFAULT_DAILY_CAP }, (_, i) => ({
    id: `s${i}`,
    sentAt: new Date(now - i * 1000).toISOString(),
  }));
  assert.equal(sentInWindow(recent, { now }), DEFAULT_DAILY_CAP);
  const gate = canSend(emailRecord({ id: "capped" }), { records: recent, now });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /daily_cap/);
  // an old send outside the 24h window does not count
  const old = [{ id: "o", sentAt: new Date(now - 48 * 3600 * 1000).toISOString() }];
  assert.equal(sentInWindow(old, { now }), 0);
});

// === 6 : dry-run makes zero provider calls ==========================

test("6. the CLI dry-run path returns before any sendEmail call", () => {
  const send = CLI.slice(CLI.indexOf("async function cmdSend"), CLI.indexOf("function cmdSuppress"));
  const dryIdx = send.indexOf("if (dryRun)");
  const sendCallIdx = send.indexOf("await sendEmail(");
  assert.ok(dryIdx > -1 && sendCallIdx > -1);
  assert.ok(dryIdx < sendCallIdx, "dry-run branch must come before the sendEmail call");
  const dryBlock = send.slice(dryIdx, sendCallIdx);
  assert.match(dryBlock, /return;/, "dry-run branch must return before sendEmail");
  assert.doesNotMatch(dryBlock, /sendEmail\(/);
});

// === 7 : test mode redirects the recipient ==========================

test("7. test mode delivers only to the test mailbox and preserves the real recipient", () => {
  const msg = renderMessage(emailRecord(), {
    fromEmail: "james@pokemondealfinder.com",
    testRecipient: "dev@test.local",
  });
  assert.equal(msg.to, "dev@test.local");
  assert.match(msg.subject, /^\[TEST\] /);
  assert.match(msg.text, /Intended recipient: editor@example\.com/);
  assert.equal(msg.meta.redirectedToTest, true);
  // without a test recipient it goes to the real address, no prefix
  const real = renderMessage(emailRecord(), { fromEmail: "james@pokemondealfinder.com" });
  assert.equal(real.to, "editor@example.com");
  assert.doesNotMatch(real.subject, /\[TEST\]/);
});

// === 8 / 9 / 10 : failure + success bookkeeping =====================

test("8. a provider failure marks the record FAILED and does not auto-retry", () => {
  const send = CLI.slice(CLI.indexOf("async function cmdSend"), CLI.indexOf("function cmdSuppress"));
  assert.match(send, /r\.status = "FAILED"/);
  assert.match(send, /not retried automatically/i);
  assert.doesNotMatch(send, /for\s*\(|while\s*\(|setTimeout|retry\(/); // no retry loop in the send path
});

test("9/10. a real success stores SENT, a sentAt timestamp, and the provider message id", () => {
  const send = CLI.slice(CLI.indexOf("async function cmdSend"), CLI.indexOf("function cmdSuppress"));
  assert.match(send, /r\.status = "SENT"/);
  assert.match(send, /r\.sentAt = now\(\)/);
  assert.match(send, /r\.providerMessageId = res\.id/);
  // and lib/email.js now surfaces the Resend id
  assert.match(read("lib/email.js"), /return \{ sent: true, id: json\?\.id \?\? null \}/);
});

// === 11 / 12 / 13 : no client creds, no public endpoint, non-email ==

test("11. outreach code never references a mail/API credential directly", () => {
  for (const src of [CORE, RENDER, CLI]) {
    assert.doesNotMatch(src, /RESEND_API_KEY|SMTP_|api\.resend\.com/);
  }
  // it also must not be a client component
  assert.doesNotMatch(CORE, /["']use client["']/);
  assert.doesNotMatch(RENDER, /["']use client["']/);
});

test("12. there is no deployed outreach API route", () => {
  let exists = false;
  try {
    readFileSync(join(ROOT, "app/api/outreach/route.js"));
    exists = true;
  } catch {}
  assert.equal(exists, false, "app/api/outreach/route.js must not exist");
});

test("13. a non-email contact type can never reach the mail provider", () => {
  for (const ct of ["MEDIUM_RESPONSE", "X_DM"]) {
    assert.equal(canSend(emailRecord({ contactType: ct }), {}).ok, false);
    assert.equal(canApprove(emailRecord({ contactType: ct, status: "DRAFT" }), {}).ok, false);
  }
  // the CLI send command bails early for non-email records
  assert.match(CLI, /no mail-provider send path/);
});

// === 14 : no follow-up automation ==================================

test("14. no automatic follow-up: followUpAt is stored but nothing sends it", () => {
  // no scheduler / timer / follow-up command in the CLI
  assert.doesNotMatch(CLI, /setInterval|setTimeout|node-cron|\bcron\b/i);
  assert.doesNotMatch(CLI, /case\s+["']follow[\s-]?up["']/i);
  // the CLI never reads followUpAt to decide to send
  assert.doesNotMatch(CLI, /\.followUpAt\b/);
  // no outreach cron in the Vercel schedule
  assert.doesNotMatch(read("vercel.json"), /outreach/i);
  // no deployed job route
  let jobExists = false;
  try {
    readFileSync(join(ROOT, "app/api/outreach-followup/route.js"));
    jobExists = true;
  } catch {}
  assert.equal(jobExists, false);
});

// === 15 : owner-transparent wording ================================

test("15. owner-transparent wording is required; third-party-user framing is rejected", () => {
  assert.equal(ownershipLanguageOk("I run PokemonDealFinder (pokemondealfinder.com). ..."), true);
  assert.equal(ownershipLanguageOk("We built PokemonDealFinder ..."), true);
  assert.equal(ownershipLanguageOk("I've been using pokemondealfinder.com and love it"), false);
  assert.equal(ownershipLanguageOk("I found PokemonDealFinder recently"), false);
  assert.equal(ownershipLanguageOk("Just a neutral sentence with no ownership claim"), false);
  // the gate blocks approval of a mis-worded record
  const bad = emailRecord({ status: "DRAFT", body: "I've been using pokemondealfinder.com..." });
  assert.equal(canApprove(bad, {}).ok, false);
});

// === 16 : outgoing spelling is unaccented "Pokemon" ================

test("16. outgoing copy is normalised to unaccented Pokemon; a preserved title is untouched", () => {
  assert.equal(normalizeSpelling("Pokémon cards and pokémon decks"), "Pokemon cards and pokemon decks");
  const kept = normalizeSpelling('See "The Pokémon Company" note about Pokémon', {
    preserve: ['"The Pokémon Company"'],
  });
  assert.match(kept, /"The Pokémon Company"/);
  assert.doesNotMatch(kept.replace('"The Pokémon Company"', ""), /Pokémon/);
  // every real record body/subject renders with no accent
  for (const r of RECORDS) {
    assert.doesNotMatch(normalizeSpelling(r.body), /Pok[éé]mon/, `${r.id} body`);
    assert.doesNotMatch(normalizeSpelling(String(r.subject)), /Pok[éé]mon/, `${r.id} subject`);
  }
});

// === 17 / 18 / 19 : the first-batch records =========================

test("17. a packz email record exists in DRAFT with a verified recipient", () => {
  const r = RECORDS.find((x) => x.id === "packz");
  assert.ok(r);
  assert.equal(r.contactType, "EMAIL");
  assert.equal(r.status, "DRAFT");
  assert.equal(r.recipient, "support@packz.io");
  assert.match(r.body, /I run PokemonDealFinder/);
});

test("18. a voxbooster email record exists in DRAFT and carries snapshot placeholders (frozen at approve)", () => {
  const r = RECORDS.find((x) => x.id === "voxbooster");
  assert.ok(r);
  assert.equal(r.contactType, "EMAIL");
  assert.equal(r.status, "DRAFT");
  assert.equal(r.recipient, "contact@voxbooster.com");
  assert.equal(r.snapshot, null, "snapshot must not be pre-frozen in the committed record");
  assert.match(r.body, /\{\{under5Pct\}\}/);
  assert.match(r.body, /priced,? English,? non-specialty cards/i, "keeps the population qualifier");
});

test("19. PokemonPriceTracker is NOT in this batch", () => {
  assert.ok(
    !RECORDS.some(
      (r) => /pokemonpricetracker|pokepricetracker/i.test(`${r.id} ${r.organisation} ${r.recipient}`)
    ),
    "no PokemonPriceTracker record in batch 1"
  );
  assert.equal(RECORDS.length, 4);
});

// === 20 : existing transactional email untouched ===================

test("20. lib/email.js still exports the existing mailer API with an unchanged send signature", () => {
  const src = read("lib/email.js");
  assert.match(src, /module\.exports = \{ emailEnabled, sendEmail, sendBatch \}/);
  assert.match(src, /async function sendEmail\(\{ to, subject, html, text, replyTo \}\)/);
  assert.match(src, /function emailEnabled\(\)/);
  assert.match(src, /async function sendBatch\(messages\)/);
});

// === extras ========================================================

test("non-email records in the batch stay DRAFT and name their manual channel", () => {
  const sl = RECORDS.find((r) => r.id === "stephen-leonard");
  const cr = RECORDS.find((r) => r.id === "cardrake");
  assert.equal(sl.contactType, "MEDIUM_RESPONSE");
  assert.equal(cr.contactType, "X_DM");
  for (const r of [sl, cr]) {
    assert.equal(r.status, "DRAFT");
    assert.match(r.note ?? "", /manual|by hand|No mail-provider/i);
  }
});

test("resolveBody freezes exactly what will be sent; missing snapshot throws", () => {
  const r = emailRecord({ body: "{{under5Pct}}% under $5 of {{population}}" });
  assert.throws(() => resolveBody(r), /snapshot is not frozen/);
  r.snapshot = { under5Pct: 65.2, population: 21815 };
  assert.equal(resolveBody(r), "65.2% under $5 of 21,815");
});

test("withUtm is minimal and idempotent", () => {
  assert.equal(
    withUtm("https://pokemondealfinder.com/x"),
    "https://pokemondealfinder.com/x?utm_source=outreach&utm_medium=email&utm_campaign=authority"
  );
  assert.equal(withUtm("https://x/?utm_source=a"), "https://x/?utm_source=a");
});
