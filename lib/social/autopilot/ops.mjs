// SOCIAL-LIVE-3 - autopilot OPERATIONS that run on Vercel (production env
// holds the Buffer token and the Resend key; no secret is copied anywhere):
//
//   queueAutopilot()  AUTOPILOT_READY placements (rendered + reviewed + hosted
//                     by the GitHub render worker) -> Buffer scheduled posts.
//   runSocialHealth() reconcile queued posts from provider evidence, verify
//                     sent posts are publicly visible on the right account,
//                     detect empty slots / stuck submits / failures.
//   ownerAlert()      one debounced email to SOCIAL_ALERT_EMAIL via Resend.
//
// Gates (all before any provider call): durable backlog circuit (emergency
// pause), SOCIAL_BUFFER_BACKLOG_KILL, SOCIAL_BUFFER_BACKLOG_ENABLED=true +
// SOCIAL_BUFFER_BACKLOG_MODE=scheduled.

import { createHash } from "node:crypto";
import { loadPlacements, patchPlacement, recordQaRun } from "../newsroom/db.mjs";
import { loadBacklogCircuit } from "../newsroom/backlogCircuit.mjs";
import { resolveBacklogPosture } from "../newsroom/backlogConfig.mjs";
import { getSocialProvider } from "../providers/index.mjs";
import { slotsBooked } from "../../newsroom/backlogRefill.mjs";
import { planSlotGroups, brisbaneLabel, autopilotPlatforms, manualPlatforms } from "./slots.mjs";
import { verifyPublicPost } from "./publicCheck.mjs";
import { supabaseAdmin } from "../../supabaseAdmin.js";
import emailMod from "../../email.js";

export const QUEUE_HORIZON_HOURS = 48;
export const QUEUE_MIN_LEAD_MINUTES = 10;
export const ALERT_DEBOUNCE_HOURS = 12;
// SOCIAL-LIVE-4 - a Buffer 429 is refused before Buffer creates anything, so
// that submit (and only that one) is retried on a later hourly run. Timeouts,
// network errors, 5xx and validation errors are never blind-retried: the post
// may exist, so they stay QA_WATCH with an owner alert.
export const RETRYABLE_QUEUE_REASONS = Object.freeze(["buffer_rate_limited"]);
export const MAX_QUEUE_ATTEMPTS = 3;
// SOCIAL-LIVE-4 - an explicit pause (owner SUSPEND event or the kill flag)
// also withdraws autopilot posts already waiting in Buffer, so a pause holds
// within one hourly run instead of letting up to 48 h of queued posts send.
export const WITHDRAW_MIN_LEAD_MINUTES = 15;

// pure: the queued autopilot posts an explicit pause withdraws from Buffer
export function pauseWithdrawals(rows = [], { now = Date.now() } = {}) {
  return rows.filter(
    (p) =>
      p.status === "BUFFER_QUEUED" &&
      Boolean(p.buffer_provider_ref) &&
      String(p.story_id ?? "").startsWith("autopilot-") &&
      Date.parse(p.scheduled_for ?? "") > now + WITHDRAW_MIN_LEAD_MINUTES * 60_000
  );
}

// pure: what a rejected Buffer submit becomes
export function rejectionOutcome(res, attemptsBefore = 0) {
  const attempts = (Number(attemptsBefore) || 0) + 1;
  const retry = RETRYABLE_QUEUE_REASONS.includes(res?.reason) && attempts < MAX_QUEUE_ATTEMPTS;
  return { retry, attempts, status: retry ? "AUTOPILOT_READY" : "QA_WATCH" };
}

// ---- owner alert (debounced per distinct message set) -----------------
export async function ownerAlert({ subject, lines = [], env = process.env, now = Date.now() } = {}) {
  const to = env.SOCIAL_ALERT_EMAIL;
  if (!to) return { sent: false, reason: "SOCIAL_ALERT_EMAIL not set" };
  const key = createHash("sha256").update(`${subject}\n${[...lines].sort().join("\n")}`).digest("hex").slice(0, 24);
  const db = supabaseAdmin();
  const since = new Date(now - ALERT_DEBOUNCE_HOURS * 3_600_000).toISOString();
  const { data: prior } = await db.from("social_qa_runs").select("qa_id").eq("qa_type", "SOCIAL_ALERT").gte("checked_at", since).contains("detail", { key }).limit(1);
  if (prior?.length) return { sent: false, reason: "debounced", key };
  const text = `${lines.join("\n")}\n\nPokemonDealFinder social autopilot, ${new Date(now).toISOString()}.\nEmergency pause: node scripts/socialBacklogCircuit.mjs suspend`;
  const html = `<pre style="font:14px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</pre>`;
  const r = await emailMod.sendEmail({ to, subject: `[PokemonDealFinder social] ${String(subject).slice(0, 140)}`, text, html });
  await recordQaRun({ story_id: null, placement_id: null, qa_type: "SOCIAL_ALERT", result: r.sent ? "FAIL" : "WATCH", blockers: lines.slice(0, 20), detail: { key, subject, sent: Boolean(r.sent), resend_id: r.id ?? null, reason: r.reason ?? null } });
  return { sent: Boolean(r.sent), id: r.id ?? null, reason: r.reason ?? null, key };
}

function gates(env, now) {
  return Promise.all([loadBacklogCircuit({ now })]).then(([circuit]) => {
    const posture = resolveBacklogPosture(env, { requestQueue: true });
    const mode = String(env.SOCIAL_BUFFER_BACKLOG_MODE ?? "").toLowerCase();
    const blocked = circuit.state !== "CLOSED" ? `circuit ${circuit.state}` : posture.kill ? "kill flag" : !posture.canQueueProvider ? posture.reason : mode !== "scheduled" ? `mode ${mode || "unset"}` : null;
    // only a deliberate stop withdraws queued posts - never an unreadable
    // circuit, an automatic trip or a configuration gap
    const explicitPause = circuit.state === "OWNER_SUSPENDED" || posture.kill === true;
    return { circuit: circuit.state, posture: posture.mode, blocked, explicitPause };
  });
}

// ---- queue -------------------------------------------------------------
export async function queueAutopilot({ env = process.env, now = Date.now(), channels, provider = null, dryRun = false } = {}) {
  const report = { at: new Date(now).toISOString(), dry_run: dryRun, queued: [], skipped: [], alerts: [] };
  const g = await gates(env, now);
  Object.assign(report, { circuit: g.circuit, posture: g.posture });
  if (g.blocked && !dryRun) {
    report.outcome = `BLOCKED: ${g.blocked}`;
    if (g.explicitPause) {
      report.withdrawn = [];
      const prov = provider ?? getSocialProvider(env);
      const { rows } = await loadPlacements({});
      for (const p of pauseWithdrawals(rows, { now })) {
        // eslint-disable-next-line no-await-in-loop
        const d = await prov.deletePost(p.buffer_provider_ref);
        if (d?.ok && d.deleted) {
          // back to a reserved slot: a resume re-queues it if the slot is still ahead
          // eslint-disable-next-line no-await-in-loop
          await patchPlacement(p.placement_id, { status: "AUTOPILOT_READY", buffer_provider_ref: null, scheduled_for: null, provider_state: "WITHDRAWN_BY_PAUSE" });
          report.withdrawn.push({ placement_id: p.placement_id, platform: p.platform, at: brisbaneLabel(p.scheduled_for) });
        } else {
          report.alerts.push(`pause: ${p.placement_id} (${p.platform}, ${brisbaneLabel(p.scheduled_for)}) is still queued in Buffer (${d?.reason ?? "delete failed"}) - pause that channel's queue in Buffer`);
        }
      }
    }
    return report;
  }

  const prov = provider ?? getSocialProvider(env);
  const channelFor = {};
  if (!dryRun) {
    const lc = await prov.listChannels();
    if (!lc.ok) { report.alerts.push(`Buffer channel list failed: ${lc.reason}`); report.outcome = "CHANNELS_UNAVAILABLE"; return report; }
    // only the feeds autopilot owns: a manually produced channel stays
    // connected but is never resolved here, so it is never submitted to and
    // never reported as unusable.
    for (const p of autopilotPlatforms(env)) {
      const alias = `${p}_main`;
      const c = lc.channels.find((x) => x.id === channels[alias]);
      if (c && c.service === channels._channels[alias].service && !c.locked && !c.disconnected) channelFor[p] = c.id;
      else report.alerts.push(`${p} Buffer channel unusable (missing, locked, disconnected or account mismatch)`);
    }
  }

  const { rows } = await loadPlacements({});
  const others = rows.filter((p) => p.status !== "AUTOPILOT_READY");
  const booked = slotsBooked(others);
  const ready = rows.filter((p) => p.status === "AUTOPILOT_READY" && p.planned_for).sort((a, b) => Date.parse(a.planned_for) - Date.parse(b.planned_for));
  for (const p of ready) {
    const due = Date.parse(p.planned_for);
    const tag = { placement_id: p.placement_id, platform: p.platform, at: brisbaneLabel(p.planned_for) };
    // A row reserved before the feed became manually produced is left exactly
    // as it is - not submitted, not marked missed, not superseded - and
    // reported so it can be judged by hand rather than acted on here.
    if (manualPlatforms(env).has(p.platform)) {
      report.skipped.push({ ...tag, reason: "manually produced feed - left for the owner, not submitted" });
      continue;
    }
    if (due < now + QUEUE_MIN_LEAD_MINUTES * 60_000) {
      if (!dryRun) await patchPlacement(p.placement_id, { status: "AUTOPILOT_MISSED" });
      report.alerts.push(`${p.placement_id} (${p.platform}) missed its ${tag.at} slot before it could be queued`);
      continue;
    }
    if (due > now + QUEUE_HORIZON_HOURS * 3_600_000) { report.skipped.push({ ...tag, reason: "beyond queue horizon" }); continue; }
    if (booked.has(`${p.platform}|${due}`)) {
      if (!dryRun) await patchPlacement(p.placement_id, { status: "SUPERSEDED", provider_state: "SLOT_TAKEN" });
      report.skipped.push({ ...tag, reason: "feed slot already holds a post" });
      continue;
    }
    if (dryRun) { report.queued.push({ ...tag, dry: true }); continue; }
    if (!channelFor[p.platform]) { report.skipped.push({ ...tag, reason: "channel unusable" }); continue; }
    const cap = p.caption_style ?? {};
    const isVideo = p.platform === "tiktok" || p.platform === "youtube";
    // crash marker BEFORE the provider call: an unknown outcome is never blind-retried
    await patchPlacement(p.placement_id, { status: "BUFFER_SUBMITTING", scheduled_for: p.planned_for });
    const res = await prov.createPost({
      channelId: channelFor[p.platform], platform: p.platform, text: cap.text, dueAt: p.planned_for, schedulingType: "automatic",
      assets: [{ type: isVideo ? "video" : "image", url: p.hosted_url }],
      ...(cap.site_link ? { siteLink: cap.site_link } : {}), ...(cap.tiktok_title ? { tiktokTitle: cap.tiktok_title } : {}), ...(cap.youtube_title ? { youtubeTitle: cap.youtube_title } : {}),
    });
    if (!res.accepted) {
      const next = rejectionOutcome(res, cap.queue_attempts);
      await patchPlacement(p.placement_id, { status: next.status, scheduled_for: null, provider_state: `${next.retry ? "RETRY" : "REJECTED"}:${res.reason}`, caption_style: { ...cap, queue_attempts: next.attempts } });
      if (next.retry) report.skipped.push({ ...tag, reason: `Buffer ${res.reason} - retry ${next.attempts + 1} of ${MAX_QUEUE_ATTEMPTS} next run` });
      else report.alerts.push(`${p.platform} post ${p.placement_id} rejected by Buffer after ${next.attempts} attempt(s): ${res.reason} ${String(res.detail ?? "").slice(0, 160)}`);
      continue;
    }
    await patchPlacement(p.placement_id, { status: "BUFFER_QUEUED", buffer_provider_ref: res.id, provider_state: res.statusRaw ?? "scheduled" });
    booked.add(`${p.platform}|${due}`);
    report.queued.push({ ...tag, provider_ref: res.id });
  }
  report.outcome = report.queued.length ? "QUEUED" : "NOTHING_TO_QUEUE";
  return report;
}

// ---- health ------------------------------------------------------------
export async function runSocialHealth({ env = process.env, now = Date.now(), provider = null } = {}) {
  const alerts = [];
  const published = [];
  const publicChecks = [];
  const circuit = await loadBacklogCircuit({ now });
  if (circuit.state !== "CLOSED") alerts.push(`backlog circuit ${circuit.state}${circuit.reason ? `: ${circuit.reason}` : ""} - publishing is paused`);
  const { rows } = await loadPlacements({});
  const prov = provider ?? getSocialProvider(env);
  for (const p of rows) {
    if (p.status === "BUFFER_SUBMITTING") {
      const since = Date.parse(p.updated_at ?? "");
      if (!Number.isFinite(since) || now - since > 60 * 60_000) alerts.push(`${p.placement_id} (${p.platform}) stuck at BUFFER_SUBMITTING - check Buffer before any resubmit`);
      continue;
    }
    if (p.status !== "BUFFER_QUEUED" || !p.buffer_provider_ref) continue;
    // only posts that are due are read (keeps well inside Buffer's rate limit)
    const dueAt = Date.parse(p.scheduled_for ?? "");
    if (Number.isFinite(dueAt) && dueAt > now) continue;
    // eslint-disable-next-line no-await-in-loop
    const st = await prov.getPostStatus(p.buffer_provider_ref);
    if (!st.ok) {
      // a rate limit is transient: the next run retries; only a post that stays
      // unreadable long past its slot is escalated
      if (st.reason === "buffer_rate_limited" && now - dueAt < 6 * 3_600_000) continue;
      alerts.push(`${p.placement_id} (${p.platform}) provider read failed: ${st.reason}`);
      continue;
    }
    if (st.published) {
      // eslint-disable-next-line no-await-in-loop
      await patchPlacement(p.placement_id, { status: "PUBLISHED", published_at: st.publishedAt, platform_post_url: st.platformPostUrl ?? null, provider_state: st.statusRaw });
      Object.assign(p, { status: "PUBLISHED", published_at: st.publishedAt, platform_post_url: st.platformPostUrl ?? null });
      published.push({ placement_id: p.placement_id, platform: p.platform, url: st.platformPostUrl ?? null });
      continue;
    }
    if (st.failed) {
      // eslint-disable-next-line no-await-in-loop
      await patchPlacement(p.placement_id, { status: "QA_WATCH", provider_state: `FAILED:${st.failReason}` });
      alerts.push(`${p.placement_id} (${p.platform}) FAILED at the provider: ${st.failReason}`);
      continue;
    }
    const due = Date.parse(p.scheduled_for ?? "");
    if (Number.isFinite(due) && now - due > 90 * 60_000) alerts.push(`${p.placement_id} (${p.platform}) ${Math.round((now - due) / 60_000)} min past its slot, provider status ${st.statusRaw}`);
  }
  for (const p of rows) {
    if (p.status !== "PUBLISHED" || p.caption_style?.public_verified_at) continue;
    const at = Date.parse(p.published_at ?? "");
    if (!Number.isFinite(at) || now - at > 3 * 86_400_000) continue;
    // eslint-disable-next-line no-await-in-loop
    const v = await verifyPublicPost(p.platform, p.platform_post_url);
    publicChecks.push({ placement_id: p.placement_id, platform: p.platform, ok: v.ok, detail: v.detail });
    if (v.ok) {
      // eslint-disable-next-line no-await-in-loop
      await patchPlacement(p.placement_id, { caption_style: { ...(p.caption_style ?? {}), public_verified_at: new Date(now).toISOString(), public_detail: v.detail } });
    } else if (now - at > 60 * 60_000) {
      alerts.push(`${p.placement_id} (${p.platform}) sent ${Math.round((now - at) / 60_000)} min ago but not publicly visible on the account: ${v.detail}`);
    }
  }
  // coverage: every feed slot in the next 24 h should already hold a post
  const occupied = slotsBooked(rows.map((p) => (p.status === "AUTOPILOT_READY" ? { ...p, scheduled_for: p.planned_for, status: "BUFFER_QUEUED" } : p)));
  const gaps = [];
  for (const grp of planSlotGroups({ now, horizonHours: 24, leadMinutes: 0 })) {
    for (const [platform, t] of Object.entries(grp.times)) if (!occupied.has(`${platform}|${Date.parse(t)}`)) gaps.push(`${platform} ${brisbaneLabel(t)}`);
  }
  if (gaps.length) alerts.push(`empty posting slots in the next 24 h: ${gaps.join(", ")}`);
  return { at: new Date(now).toISOString(), circuit: circuit.state, published_now: published, public_checks: publicChecks, coverage_gaps_24h: gaps, alerts };
}
