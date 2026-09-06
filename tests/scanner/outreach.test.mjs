// SEO Phase 10D (+ closeout) - approval-gated manual outreach sender.
// These pin the safety properties: cold outreach NEVER touches the Resend
// transactional mailer (lib/email.js); DRAFT can't send; only APPROVED
// reaches the outreach provider adapter; duplicates + suppression + a
// daily cap of 5 block sends; dry-run and test mode never touch a real
// recipient; owner-transparent wording is required; outgoing copy is
// unaccented "Pokemon"; the existing transactional mail path is
// untouched. No network in these tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  canApprove,
  canSend,
  isSuppressed,
  submissionsInWindow,
  alreadyContacted,
  applySyncResult,
  resolveBody,
  normalizeSpelling,
  ownershipLanguageOk,
  STATUSES,
  DEFAULT_DAILY_CAP,
} from "../../lib/outreach/core.js";
import { renderMessage, withUtm } from "../../lib/outreach/render.js";
import { getProvider, _providers, normaliseLeadStatus } from "../../lib/outreach/provider.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const RECORDS = JSON.parse(read("lib/outreach/records.json"));
const CLI = read("scripts/outreach.mjs");
const CORE = read("lib/outreach/core.js");
const RENDER = read("lib/outreach/render.js");
const PROVIDER_SRC = read("lib/outreach/provider.js");
const OUTREACH_SRCS = { CORE, RENDER, CLI, PROVIDER_SRC };

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

// === 3 : duplicate SENT *or QUEUED* recipient/target blocked ========

test("3/C9. a second initial email is blocked while the first is SENT or QUEUED", () => {
  for (const st of ["SENT", "QUEUED"]) {
    const first = emailRecord({
      id: "prev",
      status: st,
      sentAt: st === "SENT" ? new Date().toISOString() : null,
      queuedAt: st === "QUEUED" ? new Date().toISOString() : null,
    });
    const next = emailRecord({ id: "dup" });
    assert.equal(alreadyContacted(next, [first, next]), true, `alreadyContacted for ${st}`);
    const gate = canSend(next, { records: [first, next] });
    assert.equal(gate.ok, false, `canSend blocked for ${st}`);
    assert.match(gate.reason, /duplicate/);
  }
  // a different target page to the same recipient is NOT a duplicate
  const q = emailRecord({ id: "prev", status: "QUEUED", queuedAt: new Date().toISOString() });
  const other = emailRecord({ id: "other", targetPage: "https://example.com/other" });
  assert.equal(canSend(other, { records: [q, other] }).ok, true);
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

// === 5 : daily cap counts QUEUED + SENT ============================

test("5/C10. the daily cap counts QUEUED + SENT submissions, not just sent", () => {
  const now = Date.now();
  // a full window of QUEUED-only records (queuedAt, no sentAt)
  const recent = Array.from({ length: DEFAULT_DAILY_CAP }, (_, i) => ({
    id: `q${i}`,
    status: "QUEUED",
    queuedAt: new Date(now - i * 1000).toISOString(),
    sentAt: null,
  }));
  assert.equal(submissionsInWindow(recent, { now }), DEFAULT_DAILY_CAP);
  const gate = canSend(emailRecord({ id: "capped" }), { records: recent, now });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /daily_cap/);
  // an old submission outside the 24h window does not count
  const old = [{ id: "o", queuedAt: new Date(now - 48 * 3600 * 1000).toISOString() }];
  assert.equal(submissionsInWindow(old, { now }), 0);
});

// === 6 : dry-run makes zero provider calls ==========================

test("6/C14. the CLI dry-run path returns before any provider submit call", () => {
  const send = CLI.slice(CLI.indexOf("async function cmdSend"), CLI.indexOf("function cmdSuppress"));
  const dryIdx = send.indexOf("if (dryRun)");
  const sendCallIdx = send.indexOf("await PROVIDER.submitLead(");
  assert.ok(dryIdx > -1 && sendCallIdx > -1, "cmdSend must have a dry-run branch and a PROVIDER.submitLead call");
  assert.ok(dryIdx < sendCallIdx, "dry-run branch must come before the provider submit call");
  const dryBlock = send.slice(dryIdx, sendCallIdx);
  assert.match(dryBlock, /return;/, "dry-run branch must return before the provider call");
  assert.doesNotMatch(dryBlock, /PROVIDER\.(submitLead|send|getLeadStatus)\(|sendEmail\(/);
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

// === 8 / 9 / 10 : failure + submit + sync bookkeeping ===============

const CMD_SEND = CLI.slice(CLI.indexOf("async function cmdSend"), CLI.indexOf("function cmdSuppress"));
const CMD_SYNC = CLI.slice(CLI.indexOf("async function cmdSync"), CLI.indexOf("// --- dispatch"));

test("8/C13. a provider CREATE-LEAD failure marks the record FAILED and does not auto-retry", () => {
  assert.match(CMD_SEND, /res\?\.accepted/);
  assert.match(CMD_SEND, /r\.status = "FAILED"/);
  assert.match(CMD_SEND, /not retried automatically/i);
  assert.doesNotMatch(CMD_SEND, /for\s*\(|while\s*\(|setTimeout|retry\(/);
});

test("C5/C6/C7/C8. a successful create-lead lands on QUEUED (not SENT); queuedAt set; sentAt stays null", () => {
  assert.match(CMD_SEND, /r\.status = "QUEUED"/);
  assert.match(CMD_SEND, /r\.queuedAt = now\(\)/);
  assert.match(CMD_SEND, /r\.sentAt = null/);
  assert.doesNotMatch(CMD_SEND, /r\.status = "SENT"/, "cmdSend must NOT set SENT");
  assert.doesNotMatch(CMD_SEND, /r\.sentAt = now\(\)/, "cmdSend must NOT stamp sentAt with the local clock");
  // provider name + external lead ref stored
  assert.match(CMD_SEND, /r\.provider = PROVIDER\.name/);
  assert.match(CMD_SEND, /r\.providerRef = res\.id/);
});

test("C4/C11/C12. only `sync` promotes QUEUED->SENT, via applySyncResult on Instantly evidence", () => {
  assert.match(CMD_SYNC, /await PROVIDER\.getLeadStatus\(r\.providerRef\)/);
  assert.match(CMD_SYNC, /applySyncResult\(r, reading/);
  // cmdSync never fabricates a sentAt; it only merges the patch
  assert.doesNotMatch(CMD_SYNC, /r\.sentAt = now\(\)/);
  assert.match(CMD_SYNC, /Object\.assign\(r, patch\)/);
});

test("C11/C12. applySyncResult: QUEUED -> SENT only on real send evidence; sentAt = the provider timestamp", () => {
  const q = () => emailRecord({ id: "q", status: "QUEUED", providerRef: "lead_1", queuedAt: "2026-09-02T09:00:00.000Z" });

  // no evidence yet -> stays QUEUED, no sentAt
  let r = applySyncResult(q(), { ok: true, sent: false, sentAt: null });
  assert.equal(r.patch.status, undefined);
  assert.match(r.note, /no send evidence/i);

  // Instantly reports a real send timestamp -> SENT with THAT timestamp
  r = applySyncResult(q(), { ok: true, sent: true, sentAt: "2026-09-02T09:07:11.000Z" });
  assert.equal(r.patch.status, "SENT");
  assert.equal(r.patch.sentAt, "2026-09-02T09:07:11.000Z"); // provider evidence, not local clock

  // bounce -> FAILED ; unsubscribe -> DO_NOT_CONTACT (+ suppress)
  assert.equal(applySyncResult(q(), { ok: true, bounced: true }).patch.status, "FAILED");
  const u = applySyncResult(q(), { ok: true, unsubscribed: true });
  assert.equal(u.patch.status, "DO_NOT_CONTACT");
  assert.equal(u.suppress, true);

  // a non-QUEUED record is never touched
  assert.equal(applySyncResult(emailRecord({ status: "SENT" }), { ok: true, sent: true, sentAt: "x" }).patch, null);
});

test("C1. normaliseLeadStatus maps the documented Instantly Lead fields to send evidence", () => {
  // timestamp_last_contact non-null => sent
  let e = normaliseLeadStatus({ status: 1, timestamp_last_contact: "2026-09-02T09:07:00.000Z" });
  assert.equal(e.sent, true);
  assert.equal(e.sentAt, "2026-09-02T09:07:00.000Z");
  // status_summary step-executed timestamp is preferred when present
  e = normaliseLeadStatus({
    status: 1,
    timestamp_last_contact: "2026-09-02T09:07:00.000Z",
    status_summary: { lastStep: { timestamp_executed: "2026-09-02T09:06:30.000Z" } },
  });
  assert.equal(e.sentAt, "2026-09-02T09:06:30.000Z");
  // freshly created lead, nothing sent
  e = normaliseLeadStatus({ status: 1 });
  assert.equal(e.sent, false);
  assert.equal(e.sentAt, null);
  // Instantly status enums: -1 bounced, -2 unsubscribed
  assert.equal(normaliseLeadStatus({ status: -1, timestamp_last_contact: "x" }).bounced, true);
  assert.equal(normaliseLeadStatus({ status: -1, timestamp_last_contact: "x" }).sent, false);
  assert.equal(normaliseLeadStatus({ status: -2 }).unsubscribed, true);
});

// === 11 / 12 / 13 : no client creds, no public endpoint, non-email ==

test("11. outreach code carries no mail/API credential and is not a client component", () => {
  const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [name, src] of Object.entries(OUTREACH_SRCS)) {
    const code = strip(src);
    assert.doesNotMatch(code, /RESEND_API_KEY|SMTP_|api\.resend\.com/, `${name} references a Resend credential`);
    assert.doesNotMatch(code, /["']use client["']/, `${name} is a client component`);
  }
  // the Instantly key is only ever read from process.env, server-side
  assert.match(PROVIDER_SRC, /process\.env\.INSTANTLY_API_KEY/);
  assert.doesNotMatch(PROVIDER_SRC, /NEXT_PUBLIC_/);
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
  // WEB_FORM (SEO-GSC-5) is tracked for the audit trail but, like
  // MEDIUM_RESPONSE / X_DM, is NOT in SENDABLE_CONTACT_TYPES.
  for (const ct of ["MEDIUM_RESPONSE", "X_DM", "WEB_FORM"]) {
    const send = canSend(emailRecord({ contactType: ct, status: "APPROVED" }), {});
    assert.equal(send.ok, false, `canSend ${ct}`);
    assert.equal(send.reason, "not_an_email_record", `canSend ${ct} reason`);
    const appr = canApprove(emailRecord({ contactType: ct, status: "DRAFT" }), {});
    assert.equal(appr.ok, false, `canApprove ${ct}`);
    assert.equal(appr.reason, "not_an_email_record", `canApprove ${ct} reason`);
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

test("17. the packz email record: real owner-authorized send (SEO-GSC-5.2B) landed on QUEUED, not SENT", () => {
  const r = RECORDS.find((x) => x.id === "packz");
  assert.ok(r);
  assert.equal(r.contactType, "EMAIL");
  assert.equal(r.recipient, "support@packz.io");
  assert.match(r.body, /I run PokemonDealFinder/);
  // 2026-09-06: explicit per-record owner approval -> one real Instantly
  // lead. A provider-accepted lead is QUEUED; SENT comes ONLY from a later
  // sync on real send evidence.
  assert.equal(r.status, "QUEUED", `unexpected status ${r.status}`);
  assert.equal(r.provider, "instantly");
  assert.ok(r.providerRef, "a real provider lead ref was stored");
  assert.ok(r.queuedAt, "queuedAt stamped at submit");
  assert.equal(r.sentAt, null, "sentAt must NOT be set from the local clock");
  assert.equal(r.lastError, null);
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

test("19. Batch 1 record set: packz + pokemonpricetracker QUEUED (SEO-GSC-5.2B authorized send); everyone else DRAFT; nothing SENT", () => {
  assert.deepEqual(
    RECORDS.map((r) => r.id).sort(),
    [
      "cardrake",
      "delightfultcg",
      "packz",
      "pokemonpricetracker",
      "pokemonwizard",
      "raidertraders",
      "stephen-leonard",
      "voxbooster",
    ],
    "exactly the 10D records + the 4 new SEO-GSC-5 records"
  );

  // The ONLY two records the owner authorized for a real send.
  const QUEUED_OK = new Set(["packz", "pokemonpricetracker"]);
  const ppt = RECORDS.find((r) => r.id === "pokemonpricetracker");
  assert.equal(ppt.contactType, "EMAIL");
  assert.equal(ppt.status, "QUEUED");
  assert.equal(ppt.recipient, "pokepricetracker@proton.me");
  assert.ok(ppt.approvedAt && ppt.queuedAt && ppt.providerRef, "approved + queued + has a lead ref");
  assert.equal(ppt.sentAt, null, "no fabricated sentAt");

  for (const r of RECORDS) {
    // no record is SENT - that transition needs real Instantly send evidence
    assert.notEqual(r.status, "SENT", `${r.id} must not be SENT without provider evidence`);
    assert.equal(r.sentAt ?? null, null, `${r.id} has a sentAt`);
    if (QUEUED_OK.has(r.id)) {
      assert.equal(r.status, "QUEUED", `${r.id} should be QUEUED`);
      assert.equal(r.provider, "instantly");
      assert.ok(r.providerRef && r.queuedAt, `${r.id} missing a real delivery ref`);
    } else {
      // every other prospect is untouched by the send
      assert.equal(r.status, "DRAFT", `${r.id} unexpected status ${r.status}`);
      assert.ok(!r.queuedAt && !r.providerRef, `${r.id} has a delivery field it should not`);
    }
  }
});

test("19b. the SEO-GSC-5 contact-form + DM prospects are non-sendable and name their manual route", () => {
  const byId = Object.fromEntries(RECORDS.map((r) => [r.id, r]));
  const expected = {
    delightfultcg: "WEB_FORM",
    pokemonwizard: "WEB_FORM",
    raidertraders: "X_DM",
  };
  for (const [id, ct] of Object.entries(expected)) {
    const r = byId[id];
    assert.ok(r, `${id} exists`);
    assert.equal(r.contactType, ct, `${id} contactType`);
    assert.equal(r.status, "DRAFT", `${id} status`);
    // not in the sendable set -> both gates refuse it
    assert.equal(canApprove({ ...r, status: "DRAFT" }, {}).reason, "not_an_email_record", `${id} canApprove`);
    assert.equal(canSend({ ...r, status: "APPROVED" }, {}).reason, "not_an_email_record", `${id} canSend`);
    // the record spells out that a human posts it by hand
    assert.match(r.note ?? "", /by hand|manual|NO mail-provider send path/i, `${id} note`);
  }
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
  // EVERY non-email record (10D + SEO-GSC-5) must be a DRAFT that spells
  // out its by-hand channel and confirms it has no mail-provider path.
  for (const r of RECORDS.filter((x) => x.contactType !== "EMAIL")) {
    assert.equal(r.status, "DRAFT", `${r.id} status`);
    assert.match(r.note ?? "", /manual|by hand|No mail-provider send path/i, `${r.id} note`);
    assert.equal(canSend({ ...r, status: "APPROVED" }, {}).reason, "not_an_email_record", `${r.id} canSend`);
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

// === 10D CLOSEOUT: Resend isolation + compliant provider adapter =====

test("C1/C16. cold outreach has ZERO code path to Resend (no import of lib/email, no sendEmail/sendBatch call)", () => {
  for (const [name, src] of Object.entries(OUTREACH_SRCS)) {
    // strip comments so a policy explanation ("...never uses Resend") is fine,
    // but an actual import / call is not
    const code = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /from ["'][^"']*\/email(\.js)?["']/, `${name} imports the transactional mailer`);
    assert.doesNotMatch(code, /require\(["'][^"']*\/email/, `${name} requires the transactional mailer`);
    assert.doesNotMatch(code, /\bsendEmail\s*\(|\bsendBatch\s*\(/, `${name} calls a Resend send helper`);
    assert.doesNotMatch(code, /RESEND_API_KEY|api\.resend\.com/, `${name} references a Resend credential/endpoint`);
  }
});

test("C2/C20. transactional routes still use Resend via lib/email.js (untouched)", () => {
  for (const p of [
    "app/api/alerts/route.js",
    "app/api/check-alerts/route.js",
    "app/api/send-digest/route.js",
  ]) {
    assert.match(read(p), /from ["']@\/lib\/email["']/, `${p} no longer imports @/lib/email`);
  }
  assert.match(read("app/api/check-alerts/route.js"), /\bsendEmail\b/);
  assert.match(read("app/api/send-digest/route.js"), /\bsendBatch\b/);
  // lib/email.js reverted to its pre-10D shape - no leftover outreach hook
  assert.doesNotMatch(read("lib/email.js"), /outreach/i);
});

test("C3/C4. an unconfigured provider refuses submit + status; the adapter exposes the right shape", async () => {
  const p = getProvider();
  assert.equal(typeof p.name, "string");
  assert.equal(typeof p.isConfigured, "function");
  assert.equal(typeof p.submitLead, "function");
  assert.equal(typeof p.getLeadStatus, "function");
  // no INSTANTLY_* env in the test process -> null provider, which refuses
  assert.equal(p.isConfigured(), false);
  const sub = await p.submitLead({ to: "x@y.z", subject: "s", text: "t" });
  assert.equal(sub.accepted, false);
  assert.match(sub.reason, /no_outreach_provider_configured/);
  const st = await p.getLeadStatus("lead_x");
  assert.equal(st.ok, false);
  // the CLI blocks a real (non-dry-run) submit when no provider is configured
  assert.match(CLI, /!PROVIDER\.isConfigured\(\)/);
  assert.match(CLI, /no outreach provider configured/i);
});

test("C1/C2/C3. the Instantly create-lead payload uses ONLY documented V2 fields", () => {
  const inst = _providers.instantlyProvider();
  assert.equal(inst.name, "instantly");
  assert.equal(inst.isConfigured(), false, "not configured in the test env");
  const submit = PROVIDER_SRC.slice(
    PROVIDER_SRC.indexOf("async submitLead(msg) {"),
    PROVIDER_SRC.indexOf("async getLeadStatus(ref) {")
  );
  assert.ok(submit.length > 100, "found the submitLead method body");
  // base + auth
  assert.match(PROVIDER_SRC, /const INSTANTLY_BASE = "https:\/\/api\.instantly\.ai\/api\/v2"/);
  assert.match(PROVIDER_SRC, /Authorization: `Bearer \$\{apiKey\}`/);
  // documented field names: campaign (NOT campaign_id), custom_variables
  // (NOT personalization / payload / variables), skip_if_in_campaign
  assert.match(submit, /campaign:\s*campaignId/);
  assert.doesNotMatch(submit, /campaign_id\s*:/);
  assert.match(submit, /custom_variables:\s*\{/);
  // no undocumented alias as an object key (custom_variables is fine)
  assert.doesNotMatch(submit, /(^|[\s{,])(personalization|payload|variables)\s*:/m);
  assert.match(submit, /skip_if_in_campaign:\s*true/);
  // exactly one lead per submit; no bulk / list endpoints
  assert.match(submit, /fetch\(`\$\{INSTANTLY_BASE\}\/leads`/);
  assert.doesNotMatch(PROVIDER_SRC, /bulk-add|leads\/list|\/leads\/list/);
  // the custom-variable names the pre-built campaign step references
  assert.match(submit, /outreach_subject:/);
  assert.match(submit, /outreach_body:/);
  // getLeadStatus reads GET /leads/:id
  assert.match(PROVIDER_SRC, /fetch\(`\$\{INSTANTLY_BASE\}\/leads\/\$\{encodeURIComponent\(ref\)\}`/);
});

test("C6. the application daily cap is still exactly 5", () => {
  assert.equal(DEFAULT_DAILY_CAP, 5);
  assert.match(CORE, /DEFAULT_DAILY_CAP = 5/);
});

test("C17. every email record records why the public contact was appropriate", () => {
  for (const r of RECORDS.filter((x) => x.contactType === "EMAIL")) {
    assert.match(String(r.contactSourceUrl), /^https:\/\//, `${r.id} contactSourceUrl`);
    assert.ok((r.contactSourceNote ?? "").length > 20, `${r.id} contactSourceNote`);
    assert.match(r.contactSourceNote, /public|listed|Press|footer|verified/i, `${r.id} note names a public source`);
  }
  // non-email records too, for the manual audit trail
  for (const r of RECORDS.filter((x) => x.contactType !== "EMAIL")) {
    assert.match(String(r.contactSourceUrl), /^https:\/\//, `${r.id} contactSourceUrl`);
  }
});

test("C13/C14/C15/C20. voxbooster stays untouched; packz sent for real in SEO-GSC-5.2B (QUEUED, not SENT)", () => {
  const packz = RECORDS.find((r) => r.id === "packz");
  const vox = RECORDS.find((r) => r.id === "voxbooster");
  // voxbooster was NOT in any authorized send - still a pristine DRAFT
  assert.equal(vox.status, "DRAFT");
  assert.ok(!vox.queuedAt && !vox.sentAt && !vox.providerRef, "voxbooster has a delivery field");
  assert.match(vox.body, /^I run PokemonDealFinder \(pokemondealfinder\.com\)\. Your Trading Card Statistics/);
  // packz: one authorized real submit -> QUEUED, real lead ref, NO sentAt
  assert.equal(packz.status, "QUEUED");
  assert.equal(packz.provider, "instantly");
  assert.ok(packz.providerRef && packz.queuedAt);
  assert.equal(packz.sentAt, null, "QUEUED != SENT; sentAt never comes from the local clock");
  // body + recipient + target page are still the reviewed copy
  assert.match(packz.body, /^I run PokemonDealFinder \(pokemondealfinder\.com\), a free tool/);
  assert.equal(packz.recipient, "support@packz.io");
  assert.equal(packz.targetPage, "https://packz.io/blog/pokemon-card-price-checker");
  assert.equal(packz.tier, "A");
  assert.equal(packz.linkAcquired, false);
});

test("C: the state machine gained QUEUED between APPROVED and SENT", () => {
  assert.deepEqual(STATUSES, [
    "DRAFT",
    "APPROVED",
    "QUEUED",
    "SENT",
    "REPLIED",
    "FAILED",
    "DO_NOT_CONTACT",
  ]);
  // CLI list explains QUEUED vs SENT to the owner
  assert.match(CLI, /QUEUED = lead accepted by Instantly/);
  assert.match(CLI, /SENT = Instantly confirmed the email went out/);
});

test("C19. no new webhook: no deployed route + provider never POSTs a webhook", () => {
  for (const p of [
    "app/api/outreach/route.js",
    "app/api/outreach-webhook/route.js",
    "app/api/instantly/route.js",
    "app/api/instantly-webhook/route.js",
    "app/api/webhooks/route.js",
  ]) {
    let exists = false;
    try {
      readFileSync(join(ROOT, p));
      exists = true;
    } catch {}
    assert.equal(exists, false, `${p} must not exist`);
  }
  assert.doesNotMatch(PROVIDER_SRC, /\/webhooks\b/);
  assert.doesNotMatch(read("vercel.json"), /outreach|instantly|webhook/i);
});

// === TEST-MODE STATE CLEANUP (stale-error only) =====================

test("TM1. a TEST submit success records lastTest and never a delivery field; only non-test sets QUEUED", () => {
  // success branch: unconditional lastError clear, then a branch on isTest
  assert.match(
    CMD_SEND,
    /if \(res\?\.accepted\)[\s\S]*?r\.lastError = null;[\s\S]*?if \(isTest\)\s*\{\s*[\s\S]*?r\.lastTest = \{ at: now\(\), ok: true[\s\S]*?\}\s*else\s*\{\s*[\s\S]*?r\.status = "QUEUED";[\s\S]*?r\.queuedAt = now\(\);[\s\S]*?r\.providerRef = res\.id/,
    "isTest -> lastTest only; else -> QUEUED + queuedAt + providerRef"
  );
  // the isTest success sub-branch must NOT contain any delivery-field write
  const testWin = CMD_SEND.match(/if \(isTest\)\s*\{\s*\n\s*\/\/[^\n]*\n\s*(r\.lastTest = [^\n]*)\n\s*\}/);
  assert.ok(testWin, "found the isTest success sub-branch");
  assert.doesNotMatch(testWin[0], /r\.status\s*=|r\.queuedAt|r\.sentAt\s*=|r\.providerRef\s*=|r\.provider\s*=/);
});

test("TM2. a TEST submit success clears a stale lastError from an earlier failed attempt", () => {
  // r.lastError = null sits BEFORE the isTest branch in the success path,
  // so a successful test submit supersedes a prior failure too.
  assert.match(CMD_SEND, /if \(res\?\.accepted\)[\s\S]*?r\.lastError = null;[\s\S]*?if \(isTest\)/);
});

test("TM3. a FAILED TEST submit does NOT mark the real record FAILED or set lastError", () => {
  // fail branch: isTest -> test-safe lastTest + own die(), no status/lastError
  assert.match(
    CMD_SEND,
    /else \{\s*\n\s*const reason[\s\S]*?if \(isTest\)\s*\{\s*[\s\S]*?r\.lastTest = \{ at: now\(\), ok: false[\s\S]*?die\(`TEST submission failed[\s\S]*?real prospect not contacted/,
    "test-fail path is test-safe"
  );
  const testFailWin = CMD_SEND.match(/if \(isTest\)\s*\{\s*\n\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*r\.lastTest = \{ at: now\(\), ok: false[\s\S]*?die\(`TEST submission failed[^`]*`\);\s*\n\s*\}/);
  assert.ok(testFailWin, "found the isTest failure sub-branch");
  assert.doesNotMatch(testFailWin[0], /r\.status = "FAILED"|r\.lastError =/);
  // the real (non-test) failure path is still there, after the isTest guard
  assert.match(CMD_SEND, /r\.status = "FAILED";\s*\n\s*r\.lastError = \{ at: now\(\)/);
});

test("TM4. non-test success still transitions APPROVED -> QUEUED (production behaviour unchanged)", () => {
  assert.match(CMD_SEND, /r\.status = "QUEUED"/);
  assert.match(CMD_SEND, /r\.queuedAt = now\(\)/);
  // and never SENT / never a fabricated sentAt on submit
  assert.doesNotMatch(CMD_SEND, /r\.status = "SENT"/);
  assert.doesNotMatch(CMD_SEND, /r\.sentAt = now\(\)/);
});

test("TM5. Resend stays unreachable from the test-mode path", () => {
  const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(strip(CLI), /\bsendEmail\s*\(|\bsendBatch\s*\(|from ["'][^"']*\/email(\.js)?["']/);
});

test("TM6. the records file reflects the SEO-GSC-5.2B authorized real send", () => {
  const packz = RECORDS.find((r) => r.id === "packz");
  // one real Instantly submit: QUEUED, real lead ref, queuedAt stamped,
  // NO fabricated sentAt, no error.
  assert.equal(packz.status, "QUEUED");
  assert.equal(packz.lastError, null);
  assert.ok(packz.queuedAt, "queuedAt stamped at submit");
  assert.equal(packz.sentAt, null, "sentAt is set only by sync on real send evidence");
  assert.equal(packz.provider, "instantly");
  assert.ok(packz.providerRef, "a real provider lead ref is stored");
  // the historical 10D test-recipient submit is still recorded, off the
  // delivery fields, and is distinct from the real lead ref.
  assert.ok(packz.lastTest && packz.lastTest.ok === true, "the earlier test result is preserved");
  assert.equal(packz.lastTest.to, "clarkincollective@gmail.com");
  assert.notEqual(packz.lastTest.providerRef, packz.providerRef, "test ref != real send ref");
  // Voxbooster (and the non-email records) untouched by the send
  const vox = RECORDS.find((r) => r.id === "voxbooster");
  assert.equal(vox.status, "DRAFT");
  assert.equal(vox.lastError, null);
  assert.ok(!vox.lastTest);
  assert.ok(!vox.queuedAt && !vox.sentAt && !vox.providerRef);
});
