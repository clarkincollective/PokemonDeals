#!/usr/bin/env node
// SOCIAL-LIVE-2 - social publishing HEALTH CHECK / failure-alert route.
//
//   node scripts/socialHealth.mjs [--json]
//
// Read-only against Buffer (getPostStatus only - never creates, retries or
// deletes). Persists PUBLISHED / FAILED on placements only from provider
// evidence. Exits 1 (so the scheduled GitHub Actions run fails and GitHub
// emails the repository owner) when any of these need a human:
//   - the durable backlog circuit is not CLOSED (tripped / suspended / unreadable)
//   - a queued post came back FAILED from the provider, or is missing
//   - a BUFFER_SUBMITTING marker is older than 60 min (uncertain submit outcome)
//   - a post is more than 90 min past its scheduled time and still not sent

import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const { loadPlacements, patchPlacement } = await import("../lib/social/newsroom/db.mjs");
const { loadBacklogCircuit } = await import("../lib/social/newsroom/backlogCircuit.mjs");
const { getSocialProvider } = await import("../lib/social/providers/index.mjs");

const NOW = Date.now();
const alerts = [];
const published = [];

const circuit = await loadBacklogCircuit({ now: NOW });
if (circuit.state !== "CLOSED") alerts.push(`backlog circuit ${circuit.state}${circuit.reason ? `: ${circuit.reason}` : ""}`);

const { rows } = await loadPlacements({});
const prov = getSocialProvider();
for (const p of rows) {
  if (p.status === "BUFFER_SUBMITTING") {
    const since = Date.parse(p.updated_at ?? p.scheduled_for ?? "");
    if (!Number.isFinite(since) || NOW - since > 60 * 60_000) alerts.push(`${p.placement_id} (${p.platform}) stuck at BUFFER_SUBMITTING - reconcile with Buffer by hand before any resubmit`);
    continue;
  }
  if (p.status !== "BUFFER_QUEUED" || !p.buffer_provider_ref) continue;
  // eslint-disable-next-line no-await-in-loop
  const st = await prov.getPostStatus(p.buffer_provider_ref);
  if (!st.ok) { alerts.push(`${p.placement_id} (${p.platform}) provider read failed: ${st.reason}`); continue; }
  if (st.published) {
    // eslint-disable-next-line no-await-in-loop
    await patchPlacement(p.placement_id, { status: "PUBLISHED", published_at: st.publishedAt, platform_post_url: st.platformPostUrl ?? null, provider_state: st.statusRaw });
    published.push({ placement_id: p.placement_id, platform: p.platform, url: st.platformPostUrl ?? null, at: st.publishedAt });
    continue;
  }
  if (st.failed) {
    // eslint-disable-next-line no-await-in-loop
    await patchPlacement(p.placement_id, { status: "QA_WATCH", provider_state: `FAILED:${st.failReason}` });
    alerts.push(`${p.placement_id} (${p.platform}) FAILED at the provider: ${st.failReason}`);
    continue;
  }
  const due = Date.parse(p.scheduled_for ?? "");
  if (Number.isFinite(due) && NOW - due > 90 * 60_000) alerts.push(`${p.placement_id} (${p.platform}) ${Math.round((NOW - due) / 60_000)} min past its slot, provider status ${st.statusRaw}`);
}

const report = { generated_at: new Date(NOW).toISOString(), circuit: circuit.state, published_now: published, alerts };
console.log(process.argv.includes("--json") ? JSON.stringify(report, null, 2) : `circuit ${circuit.state} | newly published ${published.length} | alerts ${alerts.length}\n${alerts.map((a) => `ALERT ${a}`).join("\n")}`);
if (alerts.length) {
  for (const a of alerts) console.log(`::error::${a}`);
  process.exit(1);
}
