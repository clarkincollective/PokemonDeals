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
import { isFreeMail } from "./eligibility.mjs";
import { replenish } from "./discover.mjs";
import { canSend, isSuppressed, domainOf, submissionsInWindow, applySyncResult, DEFAULT_DAILY_CAP } from "../core.js";
import { renderMessage } from "../render.js";
import { getProvider } from "../provider.js";

export const MAX_AUTO_REPLIES_PER_THREAD = 2;
export const MIN_MINUTES_BETWEEN_AUTO_REPLIES = 60;
export const MAX_AUTO_REPLIES_PER_RUN = 10;
export const ESCALATION_REMINDER_HOURS = 48;
// suppress a free-mail sender by ADDRESS (never all of gmail.com etc.), others by domain
export const suppressionKey = (email) => (isFreeMail(domainOf(email)) ? String(email).toLowerCase() : domainOf(email));
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
  // SEND-ONLY MODE (owner decision 2026-09-14): with a leads-only key, first contact
  // may run; incoming mail cannot be read, so every detected reply is handed to the
  // owner (lead reply counters) and unsubscribes are suppressed. Needs the explicit flag.
  const sendOnly = !caps.emails_read && caps.leads_read && env.OUTREACH_SEND_ONLY_MODE === "true";
  report.mode = caps.emails_read ? "FULL" : sendOnly ? "SEND_ONLY" : "BLOCKED";
  if (!caps.emails_read && !sendOnly) report.blockers.push(`Instantly email read unavailable (${caps.detail.emails}) - needs an API key with emails:read, emails:create, block_list_entries:create (or OUTREACH_SEND_ONLY_MODE=true with a leads key)`);
  if (report.blockers.length && !dryRun) { report.outcome = "BLOCKED"; return report; }

  let records = await store.getJson("state/records.json", null);
  if (!records) { records = seed("records.json"); if (!dryRun) await store.putJson("state/records.json", records); }
  let suppression = await store.getJson("state/suppression.json", null);
  if (!suppression) { suppression = seed("suppression.json"); if (!dryRun) await store.putJson("state/suppression.json", suppression); }
  const save = async () => { if (!dryRun) { await store.putJson("state/records.json", records); await store.putJson("state/suppression.json", suppression); } };
  const suppress = async (value, reason) => {
    if (!isSuppressed(value, suppression) && !suppression.some((s) => s.domain === value)) suppression.push({ domain: value, reason, addedAt: new Date(now).toISOString(), source: "automation" });
    if (!dryRun && caps.block_list_read) await client.blockListAdd(value);
  };

  // ---- 1. incoming replies --------------------------------------------------
  if (caps.emails_read) {
    const known = new Map();
    for (const r of records) {
      if (r.contactType !== "EMAIL" || !["QUEUED", "SENT", "REPLIED", "DO_NOT_CONTACT"].includes(r.status)) continue;
      known.set(String(r.recipient).toLowerCase(), r);
      // a free-mail domain would match every stranger and warm-up sender - address only
      if (!isFreeMail(domainOf(r.recipient))) known.set(domainOf(r.recipient), r);
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
        await suppress(suppressionKey(rec.recipient), c.category === CATEGORY.OPT_OUT ? "opted out by reply" : "declined by reply");
        continue; // no reply to an opt-out or decline
      }
      rec.status = rec.status === "DO_NOT_CONTACT" ? rec.status : "REPLIED";
      rec.repliedAt = email.timestamp_email ?? new Date(now).toISOString();
      if (rec.status === "DO_NOT_CONTACT") { entry.action = "no reply - record is do-not-contact"; continue; }
      const incomingText = latestText(email);
      // eslint-disable-next-line no-await-in-loop
      const thread = (await store.getJson(`threads/${email.thread_id}.json`, null)) ?? { auto_replies: 0, last_auto_reply_at: null, history: [] };
      thread.history = [...(thread.history ?? []), { dir: "in", at: email.timestamp_email ?? new Date(now).toISOString(), from: email.from_address_email, text: incomingText.slice(0, 1500) }].slice(-8);
      const escalate = async (why, { proposed = null } = {}) => {
        entry.action = `escalated: ${why}`;
        const conversation = thread.history.map((h) => `[${h.dir === "in" ? h.from : "James (automated)"} ${String(h.at).slice(0, 16)}] ${String(h.text).replace(/\s+/g, " ").slice(0, 600)}`);
        const next = proposed
          ? ["Proposed next action: send the draft below (edit freely) from Instantly Unibox.", `Proposed reply: ${proposed.replace(/\s+/g, " ")}`]
          : ["Proposed next action: answer personally in Instantly Unibox - the topic needs your decision."];
        const esc = { record: rec.id, organisation: rec.organisation, thread_id: email.thread_id, email_id: email.id, correspondent: email.from_address_email, subject: email.subject, why, proposed, escalatedAt: new Date(now).toISOString(), lastNotifiedAt: new Date(now).toISOString(), reminders: 0, resolved: false };
        report.escalations.push(esc);
        if (!dryRun) {
          const list = (await store.getJson("state/escalations.json", [])) ?? [];
          await store.putJson("state/escalations.json", [...list.filter((x) => x.thread_id !== esc.thread_id || x.resolved), esc]);
          await store.putJson(`threads/${email.thread_id}.json`, thread);
          await alert({ subject: `outreach conversation needs you: ${rec.organisation}`, lines: [`From: ${email.from_address_email}`, `Subject: ${String(email.subject ?? "").slice(0, 120)}`, `Why it was handed to you: ${why}`, "Conversation:", ...conversation, ...next, "No further automated reply will be sent in this thread; reminders every 48 h until it is answered."] });
        }
      };
      if (c.category === CATEGORY.ESCALATE) { await escalate(c.reasons.join(", ")); continue; }
      // loop guard: at the per-thread limit, hand over WITH a proposed reply - never abandon
      if (thread.auto_replies >= MAX_AUTO_REPLIES_PER_THREAD) {
        // eslint-disable-next-line no-await-in-loop
        const p = await draftReply({ incomingText, subject: email.subject, correspondent: email.from_address_email, context: `${rec.subject} - ${rec.angle} (${rec.destinationUrl})`, oidcToken, fetchImpl });
        const proposed = p.ok && p.action === "reply" && validateReply(p.reply, { incomingText }).ok ? p.reply : null;
        await escalate(`automated reply limit (${MAX_AUTO_REPLIES_PER_THREAD}) reached in this conversation`, { proposed });
        continue;
      }
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
      await store.putJson(`threads/${email.thread_id}.json`, { ...thread, auto_replies: thread.auto_replies + 1, last_auto_reply_at: new Date(now).toISOString(), history: [...thread.history, { dir: "out", at: new Date(now).toISOString(), text: d.reply.slice(0, 1500) }].slice(-8) });
      // eslint-disable-next-line no-await-in-loop
      await store.event("auto_reply", { record: rec.id, email_id: email.id, thread_id: email.thread_id, category: c.category, model: d.model, text: d.reply });
      entry.action = "replied";
      if (c.category === CATEGORY.COVERAGE) rec.coverageReportedAt = new Date(now).toISOString();
    }
    if (!dryRun && inbox.ok) await store.putJson("state/cursor.json", { since: newest });

    // open hand-overs: resolved once a message is sent from our mailbox in the thread; otherwise remind
    const open = (await store.getJson("state/escalations.json", [])) ?? [];
    let changed = false;
    for (const esc of open.filter((x) => !x.resolved)) {
      // eslint-disable-next-line no-await-in-loop
      const sentSince = await client.listSent({ eaccount, lead: esc.correspondent, since: esc.escalatedAt });
      if (sentSince.ok && (sentSince.json?.items ?? []).some((m) => m.thread_id === esc.thread_id)) { esc.resolved = true; esc.resolvedAt = new Date(now).toISOString(); changed = true; continue; }
      if (now - Date.parse(esc.lastNotifiedAt) >= ESCALATION_REMINDER_HOURS * 3_600_000) {
        esc.reminders += 1; esc.lastNotifiedAt = new Date(now).toISOString(); changed = true;
        report.escalations.push({ ...esc, reminder: esc.reminders });
        // eslint-disable-next-line no-await-in-loop
        if (!dryRun) await alert({ subject: `reminder ${esc.reminders}: outreach conversation still needs you: ${esc.organisation}`, lines: [`From: ${esc.correspondent}`, `Subject: ${String(esc.subject ?? "").slice(0, 120)}`, `Handed over ${esc.escalatedAt.slice(0, 16)} UTC: ${esc.why}`, esc.proposed ? `Proposed reply: ${esc.proposed.replace(/\s+/g, " ")}` : "Proposed next action: answer personally in Instantly Unibox.", "Reply in the thread and the reminders stop automatically."] });
      }
    }
    if (changed && !dryRun) await store.putJson("state/escalations.json", open);
  }

  // ---- 1b. send-only mode: detect replies from lead counters and hand them over ---------
  if (sendOnly) {
    const leads = await client.listCampaignLeads({ campaign: env.INSTANTLY_CAMPAIGN_ID });
    for (const lead of leads.json?.items ?? []) {
      const rec = records.find((r) => r.providerRef === lead.id || String(r.recipient).toLowerCase() === String(lead.email).toLowerCase());
      if (!rec) continue;
      if (lead.status === -2 && rec.status !== "DO_NOT_CONTACT") { Object.assign(rec, { status: "DO_NOT_CONTACT", stopReason: "unsubscribed" }); await suppress(suppressionKey(rec.recipient), "unsubscribed via Instantly"); report.replies.push({ record: rec.id, category: "UNSUBSCRIBED" }); continue; }
      if (lead.status === -1 && rec.status !== "FAILED") { Object.assign(rec, { status: "FAILED", lastError: { at: new Date(now).toISOString(), provider: "instantly", reason: "hard_bounce" } }); await suppress(String(rec.recipient).toLowerCase(), "hard bounce"); report.replies.push({ record: rec.id, category: "BOUNCE" }); continue; }
      const seen = rec.replyCountSeen ?? 0;
      if ((lead.email_reply_count ?? 0) > seen) {
        rec.replyCountSeen = lead.email_reply_count;
        if (!["DO_NOT_CONTACT"].includes(rec.status)) rec.status = "REPLIED";
        rec.repliedAt = lead.timestamp_last_reply ?? new Date(now).toISOString();
        report.replies.push({ record: rec.id, category: "REPLY_DETECTED", count: lead.email_reply_count });
        report.escalations.push({ record: rec.id, why: "reply received (send-only mode: content not readable by the worker)" });
        if (!dryRun) await alert({ subject: `outreach reply received: ${rec.organisation}`, lines: [`${rec.organisation} (${rec.recipient}) replied (${lead.email_reply_count} repl${lead.email_reply_count === 1 ? "y" : "ies"}, latest ${String(rec.repliedAt).slice(0, 16)} UTC).`, `Your message: "${rec.subject}"`, "Proposed next action: open Instantly Unibox and answer. If they said no thanks, reply nothing - run: npm run outreach -- dnc " + rec.id, "The worker cannot read reply content with the current API key, so no automated reply was sent and no further contact will be made."] });
      }
    }
    // Replies from a DIFFERENT address than the lead (a help desk, a colleague) are not
    // counted on the lead and cannot be read with a leads-only key. Never let one go
    // unseen: once a day, list every contact from the last 14 days to check in Unibox.
    const recent = records.filter((r) => !r.test && ["QUEUED", "SENT", "REPLIED"].includes(r.status) && now - Date.parse(r.queuedAt ?? r.sentAt ?? 0) < 14 * 86_400_000);
    const digest = (await store.getJson("state/unibox-digest.json", null)) ?? { lastAt: null };
    if (recent.length && (!digest.lastAt || now - Date.parse(digest.lastAt) >= 24 * 3_600_000)) {
      report.unibox_digest = recent.map((r) => r.id);
      if (!dryRun) {
        await alert({ subject: `outreach: check Unibox for ${recent.length} open conversation${recent.length === 1 ? "" : "s"} (${new Date(now).toISOString().slice(0, 10)})`, lines: ["With the current API key the worker cannot read incoming mail, so replies sent from a different address than the one we emailed are only visible in Instantly Unibox.", ...recent.map((r) => `- ${r.organisation} (${r.recipient}) - ${r.status}${r.sentAt ? `, sent ${String(r.sentAt).slice(0, 10)}` : ""}${r.repliedAt ? `, replied ${String(r.repliedAt).slice(0, 10)}` : ""}`), "Proposed next action: open https://app.instantly.ai/app/unibox and answer anything waiting. Opt-outs: npm run outreach -- dnc <id>."] });
        await store.putJson("state/unibox-digest.json", { lastAt: new Date(now).toISOString() });
      }
    }
    await save();
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
    if (sup) await suppress(suppressionKey(r.recipient), "unsubscribed via Instantly");
    if (reading.bounced) await suppress(String(r.recipient).toLowerCase(), "hard bounce");
    report.synced.push({ record: r.id, status: r.status });
  }
  await save();

  // ---- 3b. replenish the prospect queue (at most one discovery pass a day) -------------
  const disc = (await store.getJson("state/discovery.json", null)) ?? { lastRunAt: null, topicIndex: 0 };
  if (!disc.lastRunAt || now - Date.parse(disc.lastRunAt) >= 24 * 3_600_000) {
    // up to three topics a day, stopping once the pass has added an eligible prospect
    const pass = { ran: false, added: [], candidates: 0, topic: null };
    let topicIndex = disc.topicIndex;
    for (let i = 0; i < 3; i++, topicIndex++) {
      // eslint-disable-next-line no-await-in-loop
      const one = await replenish({ records: [...records, ...pass.added], suppression, oidcToken, now, topicIndex, fetchImpl });
      if (!one.ran) { Object.assign(pass, { reason: one.reason }); break; }
      Object.assign(pass, { ran: true, topic: pass.topic ? `${pass.topic}; ${one.topic}` : one.topic, candidates: pass.candidates + (one.candidates ?? 0), error: one.error ?? pass.error });
      pass.added.push(...one.added);
      if (pass.added.some((x) => x.status === "APPROVED")) { topicIndex++; break; }
    }
    report.discovery = { ran: pass.ran, topic: pass.topic ?? null, candidates: pass.candidates ?? 0, approved: pass.added.filter((x) => x.status === "APPROVED").map((x) => x.id), skipped: pass.added.filter((x) => x.status === "SKIPPED").length, reason: pass.reason ?? pass.error ?? null };
    if (pass.ran && !dryRun) {
      records.push(...pass.added);
      await store.putJson("state/discovery.json", { lastRunAt: new Date(now).toISOString(), topicIndex, lastResult: report.discovery });
      await save();
    }
  }
  report.queue = { approved: records.filter((r) => r.status === "APPROVED").length };

  // ---- 4. first contact -------------------------------------------------------------
  const cap = Number(env.OUTREACH_DAILY_CAP || DEFAULT_DAILY_CAP);
  if (!inSendWindow(now)) report.skipped.push({ reason: "outside the weekday send window" });
  else if (report.escalations.length) report.skipped.push({ reason: "new contact paused this run while replies await the owner" });
  else {
    const candidates = records.filter((r) => r.status === "APPROVED" && r.contactType === "EMAIL").sort((a, b) => String(a.tier ?? "C").localeCompare(String(b.tier ?? "C")) || (b.score ?? 0) - (a.score ?? 0));
    for (const r of candidates) {
      if (submissionsInWindow(records.filter((x) => !x.test), { now }) >= cap) { report.skipped.push({ record: r.id, reason: `daily cap ${cap} reached` }); break; }
      const gate = canSend(r, { records: records.filter((x) => !x.test), suppression, dailyCap: cap, now });
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
