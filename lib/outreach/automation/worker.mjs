// OUTREACH-AUTO-1 - one bounded run of the outreach automation.
//
// Order (conversations before new contact):
//   0. gates: OUTREACH_AUTOMATION_ENABLED, durable emergency pause, Instantly
//      capabilities (paid plan + key scopes)
//   1. incoming replies: poll received mail (cursor, 1 h overlap) -> write-once
//      claim per email -> classify -> ignore / suppress / escalate / reply
//   2. uncertain submits: SUBMITTING records reconciled against the campaign
//      lead list before any retry
//   3. sync: QUEUED -> SENT only on Instantly send evidence
//   4. first contact: weekdays in the window, trailing-24 h cap (5), permission
//      re-check, suppression + duplicate guards, one lead per record
// No follow-up sequence exists: a record is contacted once.

import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyIncoming, latestText, CATEGORY } from "./classify.mjs";
import { validateReply } from "./guard.mjs";
import { draftReply } from "./claude.mjs";
import { instantlyClient } from "./instantly.mjs";
import { outreachStore } from "./store.mjs";
import { checkPermission } from "./qualify.mjs";
import { canSend, isSuppressed, domainOf, submissionsInWindow, applySyncResult, DEFAULT_DAILY_CAP } from "../core.js";
import { renderMessage } from "../render.js";
import { getProvider } from "../provider.js";

export const MAX_AUTO_REPLIES_PER_THREAD = 2;
export const MIN_MINUTES_BETWEEN_AUTO_REPLIES = 60;
export const MAX_AUTO_REPLIES_PER_RUN = 10;
export const SEND_WINDOW = Object.freeze({ tz: "Australia/Brisbane", days: [1, 2, 3, 4, 5], startHour: 7, endHour: 15 });
const OWN_DOMAINS = ["getpokemondealfinder.com", "pokemondealfinder.com"];

export function inSendWindow(now = Date.now()) {
  const d = new Date(now + 10 * 3_600_000); // Brisbane, no DST
  return SEND_WINDOW.days.includes(d.getUTCDay()) && d.getUTCHours() >= SEND_WINDOW.startHour && d.getUTCHours() < SEND_WINDOW.endHour;
}

function seed(file) {
  return JSON.parse(readFileSync(path.join(process.cwd(), "lib", "outreach", file), "utf8"));
}

export async function runOutreach({ env = process.env, now = Date.now(), dryRun = false, oidcToken = null, alert = async () => null, store = outreachStore(), client = instantlyClient({ apiKey: env.INSTANTLY_API_KEY }), provider = getProvider(), fetchImpl = fetch } = {}) {
  const eaccount = String(env.OUTREACH_FROM_EMAIL ?? "").toLowerCase();
  const report = { at: new Date(now).toISOString(), dry_run: dryRun, replies: [], sent: [], synced: [], skipped: [], escalations: [], blockers: [] };

  // ---- 0. gates -----------------------------------------------------------
  if (env.OUTREACH_AUTOMATION_ENABLED !== "true") report.blockers.push("OUTREACH_AUTOMATION_ENABLED is not true");
  const control = (await store.getJson("state/control.json", { paused: false })) ?? { paused: false };
  if (control.paused) report.blockers.push(`emergency pause: ${control.pausedReason ?? "paused"}`);
  if (!eaccount) report.blockers.push("OUTREACH_FROM_EMAIL not set");
  const caps = await client.capabilities({ eaccount, campaign: env.INSTANTLY_CAMPAIGN_ID });
  report.capabilities = caps;
  if (!caps.emails_read) report.blockers.push(`Instantly email read unavailable (${caps.detail.emails}) - needs an active paid plan and an API key with emails:read, emails:create, block_list_entries:create`);
  if (report.blockers.length && !dryRun) { report.outcome = "BLOCKED"; return report; }

  let records = await store.getJson("state/records.json", null);
  if (!records) { records = seed("records.json"); if (!dryRun) await store.putJson("state/records.json", records); }
  let suppression = await store.getJson("state/suppression.json", null);
  if (!suppression) { suppression = seed("suppression.json"); if (!dryRun) await store.putJson("state/suppression.json", suppression); }
  const save = async () => { if (!dryRun) { await store.putJson("state/records.json", records); await store.putJson("state/suppression.json", suppression); } };
  const suppress = async (value, reason) => {
    if (!isSuppressed(value, suppression) && !suppression.some((s) => s.domain === value)) suppression.push({ domain: value, reason, addedAt: new Date(now).toISOString(), source: "automation" });
    if (!dryRun) await client.blockListAdd(value);
  };

  // ---- 1. incoming replies --------------------------------------------------
  if (caps.emails_read) {
    const known = new Map();
    for (const r of records) {
      if (r.contactType !== "EMAIL" || !["QUEUED", "SENT", "REPLIED", "DO_NOT_CONTACT"].includes(r.status)) continue;
      known.set(String(r.recipient).toLowerCase(), r);
      known.set(domainOf(r.recipient), r);
    }
    const cursor = (await store.getJson("state/cursor.json", null))?.since ?? new Date(now - 14 * 86_400_000).toISOString();
    const since = new Date(Date.parse(cursor) - 3_600_000).toISOString();
    const inbox = await client.listReceived({ eaccount, since });
    if (!inbox.ok) report.blockers.push(`reply poll failed: ${inbox.reason} ${inbox.detail ?? ""}`);
    let autoReplies = 0;
    let newest = cursor;
    for (const email of inbox.json?.items ?? []) {
      if (Date.parse(email.timestamp_created ?? 0) > Date.parse(newest)) newest = email.timestamp_created;
      const c = classifyIncoming(email, { ownEmails: [eaccount], ownDomains: OWN_DOMAINS, knownRecipients: known });
      if (c.category === CATEGORY.IGNORE_UNKNOWN_SENDER || c.category === CATEGORY.IGNORE_OWN) continue; // warm-up / unrelated mail: no record, no claim
      // eslint-disable-next-line no-await-in-loop
      const claimed = dryRun ? true : await store.claim(`claims/${email.id}.json`, { at: new Date(now).toISOString(), category: c.category });
      if (!claimed) continue; // already handled by an earlier run
      const rec = c.record;
      const entry = { email_id: email.id, thread_id: email.thread_id, from: email.from_address_email, record: rec.id, category: c.category };
      report.replies.push(entry);
      if (c.category === CATEGORY.IGNORE_AUTO || c.category === CATEGORY.IGNORE_OOO) continue;
      if (c.category === CATEGORY.BOUNCE) {
        Object.assign(rec, { status: "FAILED", lastError: { at: new Date(now).toISOString(), provider: "instantly", reason: "hard_bounce" } });
        // eslint-disable-next-line no-await-in-loop
        await suppress(String(rec.recipient).toLowerCase(), "hard bounce");
        continue;
      }
      if (c.category === CATEGORY.OPT_OUT || c.category === CATEGORY.DECLINE) {
        Object.assign(rec, { status: "DO_NOT_CONTACT", repliedAt: rec.repliedAt ?? email.timestamp_email ?? new Date(now).toISOString(), stopReason: c.category === CATEGORY.OPT_OUT ? "opt_out" : "declined" });
        // eslint-disable-next-line no-await-in-loop
        await suppress(domainOf(rec.recipient), c.category === CATEGORY.OPT_OUT ? "opted out by reply" : "declined by reply");
        continue; // no reply to an opt-out or decline
      }
      rec.status = rec.status === "DO_NOT_CONTACT" ? rec.status : "REPLIED";
      rec.repliedAt = email.timestamp_email ?? new Date(now).toISOString();
      if (rec.status === "DO_NOT_CONTACT") { entry.action = "no reply - record is do-not-contact"; continue; }
      const incomingText = latestText(email);
      const escalate = async (why) => {
        entry.action = `escalated: ${why}`;
        report.escalations.push({ record: rec.id, from: email.from_address_email, subject: email.subject, why });
        if (!dryRun) await alert({ subject: `outreach reply needs you: ${rec.organisation}`, lines: [`From: ${email.from_address_email}`, `Subject: ${String(email.subject ?? "").slice(0, 120)}`, `Why: ${why}`, `Preview: ${incomingText.slice(0, 300).replace(/\s+/g, " ")}`, "Open Instantly Unibox to answer. No automated reply was sent."] });
      };
      if (c.category === CATEGORY.ESCALATE) { await escalate(c.reasons.join(", ")); continue; }
      // loop guard
      // eslint-disable-next-line no-await-in-loop
      const thread = (await store.getJson(`threads/${email.thread_id}.json`, null)) ?? { auto_replies: 0, last_auto_reply_at: null };
      if (thread.auto_replies >= MAX_AUTO_REPLIES_PER_THREAD) { await escalate(`thread already has ${thread.auto_replies} automated replies`); continue; }
      if (thread.last_auto_reply_at && now - Date.parse(thread.last_auto_reply_at) < MIN_MINUTES_BETWEEN_AUTO_REPLIES * 60_000) { await escalate("rapid back-and-forth (possible loop)"); continue; }
      if (autoReplies >= MAX_AUTO_REPLIES_PER_RUN) { entry.action = "deferred: per-run reply cap"; continue; }
      // eslint-disable-next-line no-await-in-loop
      const d = await draftReply({ incomingText, subject: email.subject, correspondent: email.from_address_email, context: `${rec.subject} - ${rec.angle} (${rec.destinationUrl})`, oidcToken, fetchImpl });
      if (!d.ok) { await escalate(`reply drafting unavailable: ${d.reason}`); continue; }
      if (d.action === "escalate") { await escalate(`model escalated: ${d.reason}`); continue; }
      const v = validateReply(d.reply, { incomingText });
      if (!v.ok) { await escalate(`draft failed checks: ${v.problems.join("; ")}`); continue; }
      const subject = /^re:/i.test(String(email.subject ?? "")) ? email.subject : `Re: ${email.subject ?? rec.subject}`;
      if (dryRun) { entry.action = "DRY - would reply"; entry.draft = d.reply; continue; }
      // eslint-disable-next-line no-await-in-loop
      const sent = await client.reply({ replyToUuid: email.id, eaccount, subject, text: d.reply });
      if (!sent.ok) { await escalate(`reply send failed: ${sent.reason}`); continue; }
      autoReplies += 1;
      // eslint-disable-next-line no-await-in-loop
      await store.putJson(`threads/${email.thread_id}.json`, { auto_replies: thread.auto_replies + 1, last_auto_reply_at: new Date(now).toISOString() });
      // eslint-disable-next-line no-await-in-loop
      await store.event("auto_reply", { record: rec.id, email_id: email.id, thread_id: email.thread_id, category: c.category, model: d.model, text: d.reply });
      entry.action = "replied";
      if (c.category === CATEGORY.COVERAGE) rec.coverageReportedAt = new Date(now).toISOString();
    }
    if (!dryRun && inbox.ok) await store.putJson("state/cursor.json", { since: newest });
  }

  // ---- 2. uncertain submits -----------------------------------------------------
  const stuck = records.filter((r) => r.status === "SUBMITTING");
  if (stuck.length) {
    const leads = await client.listCampaignLeads({ campaign: env.INSTANTLY_CAMPAIGN_ID });
    for (const r of stuck) {
      const lead = (leads.json?.items ?? []).find((l) => String(l.email).toLowerCase() === String(r.recipient).toLowerCase());
      if (lead) Object.assign(r, { status: "QUEUED", queuedAt: r.submittingAt, provider: "instantly", providerRef: lead.id, providerMessageId: lead.id });
      else if (leads.ok && now - Date.parse(r.submittingAt) > 30 * 60_000) Object.assign(r, { status: "APPROVED", submittingAt: null });
      report.synced.push({ record: r.id, reconciled: r.status });
    }
  }

  // ---- 3. sync ------------------------------------------------------------------------
  for (const r of records.filter((x) => x.status === "QUEUED" && x.providerRef)) {
    // eslint-disable-next-line no-await-in-loop
    const reading = await provider.getLeadStatus(r.providerRef);
    if (!reading?.ok) continue;
    const { patch, suppress: sup } = applySyncResult(r, reading);
    if (patch) Object.assign(r, patch);
    if (sup) await suppress(domainOf(r.recipient), "unsubscribed via Instantly");
    if (reading.bounced) await suppress(String(r.recipient).toLowerCase(), "hard bounce");
    report.synced.push({ record: r.id, status: r.status });
  }
  await save();

  // ---- 4. first contact -------------------------------------------------------------
  const cap = Number(env.OUTREACH_DAILY_CAP || DEFAULT_DAILY_CAP);
  if (!inSendWindow(now)) report.skipped.push({ reason: "outside the weekday send window" });
  else if (report.escalations.length) report.skipped.push({ reason: "new contact paused this run while replies await the owner" });
  else {
    const candidates = records.filter((r) => r.status === "APPROVED" && r.contactType === "EMAIL").sort((a, b) => String(a.tier ?? "C").localeCompare(String(b.tier ?? "C")) || (b.score ?? 0) - (a.score ?? 0));
    for (const r of candidates) {
      if (submissionsInWindow(records, { now }) >= cap) { report.skipped.push({ record: r.id, reason: `daily cap ${cap} reached` }); break; }
      const gate = canSend(r, { records, suppression, dailyCap: cap, now });
      if (!gate.ok) { report.skipped.push({ record: r.id, reason: gate.reason }); continue; }
      // eslint-disable-next-line no-await-in-loop
      const perm = await checkPermission(r, { fetchImpl });
      r.permissionCheck = perm;
      if (!perm.ok) { r.status = "SKIPPED"; r.skipReason = perm.problems.join("; "); report.skipped.push({ record: r.id, reason: r.skipReason }); continue; }
      const msg = renderMessage(r, { senderName: env.OUTREACH_SENDER_NAME || "James", fromEmail: eaccount, replyTo: env.OUTREACH_REPLY_TO || eaccount });
      if (dryRun) { report.sent.push({ record: r.id, to: msg.to, subject: msg.subject, dry: true }); continue; }
      Object.assign(r, { status: "SUBMITTING", submittingAt: new Date(now).toISOString() });
      // eslint-disable-next-line no-await-in-loop
      await save();
      // eslint-disable-next-line no-await-in-loop
      const res = await provider.submitLead(msg);
      r.sendLog = [...(r.sendLog ?? []), { at: new Date(now).toISOString(), kind: res.accepted ? "submit" : "fail", provider: provider.name, to: msg.to, providerRef: res.id ?? null, reason: res.reason ?? null, automated: true }];
      if (res.accepted) Object.assign(r, { status: "QUEUED", queuedAt: new Date(now).toISOString(), sentAt: null, provider: provider.name, providerRef: res.id ?? null, providerMessageId: res.id ?? null, lastError: null });
      else if (res.reason === "instantly_fetch_error") { /* unknown outcome: stays SUBMITTING, reconciled next run */ }
      else Object.assign(r, { status: "FAILED", lastError: { at: new Date(now).toISOString(), provider: provider.name, reason: res.reason, detail: String(res.detail ?? "").slice(0, 200) } });
      report.sent.push({ record: r.id, to: msg.to, status: r.status, providerRef: r.providerRef ?? null });
      // eslint-disable-next-line no-await-in-loop
      await save();
    }
  }
  report.outcome = report.blockers.length ? "PARTIAL" : "OK";
  return report;
}
