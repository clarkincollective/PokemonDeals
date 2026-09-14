// OUTREACH-AUTO-1 - the Instantly V2 calls the automation needs, beyond the
// existing lead submit / read in lib/outreach/provider.js. Never logs the key.
//
// Required API key scopes (Settings -> Integrations -> API Keys):
//   leads:read, leads:create       (existing submit / sync)
//   emails:read                    (GET  /emails - incoming replies)
//   emails:create                  (POST /emails/reply - threaded reply)
//   block_list_entries:create      (POST /block-lists-entries - opt-outs)
// The email endpoints also require an ACTIVE PAID Instantly plan (402 otherwise).

const BASE = "https://api.instantly.ai/api/v2";

export function instantlyClient({ apiKey = process.env.INSTANTLY_API_KEY, fetchImpl = fetch } = {}) {
  const call = async (method, path, body) => {
    if (!apiKey) return { ok: false, status: 0, reason: "INSTANTLY_API_KEY not set" };
    try {
      const r = await fetchImpl(BASE + path, { method, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
      const t = await r.text();
      let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* non-JSON */ }
      return r.ok ? { ok: true, status: r.status, json: j } : { ok: false, status: r.status, reason: `instantly_${r.status}`, detail: String(j?.message ?? t).slice(0, 200) };
    } catch (e) {
      return { ok: false, status: 0, reason: "instantly_fetch_error", detail: String(e?.message ?? e).slice(0, 200) };
    }
  };
  return {
    // received mail in the outreach mailbox since a timestamp (oldest first)
    listReceived: ({ eaccount, since, limit = 100 }) =>
      call("GET", `/emails?${new URLSearchParams({ email_type: "received", eaccount, min_timestamp_created: since, sort_order: "asc", limit: String(limit) })}`),
    listSent: ({ eaccount, lead, since, limit = 20 }) =>
      call("GET", `/emails?${new URLSearchParams({ email_type: "sent", eaccount, lead, min_timestamp_created: since, limit: String(limit) })}`),
    reply: ({ replyToUuid, eaccount, subject, text }) =>
      call("POST", "/emails/reply", { reply_to_uuid: replyToUuid, eaccount, subject, body: { text } }),
    listCampaignLeads: ({ campaign, limit = 100 }) => call("POST", "/leads/list", { campaign, limit }),
    blockListAdd: (value) => call("POST", "/block-lists-entries", { bl_value: value }),
    // non-destructive scope/entitlement probe: which capabilities work right now
    async capabilities({ eaccount, campaign }) {
      const since = new Date(Date.now() - 3_600_000).toISOString();
      const [leads, emails, blocks] = await Promise.all([
        call("POST", "/leads/list", { campaign, limit: 1 }),
        call("GET", `/emails?${new URLSearchParams({ email_type: "received", eaccount, min_timestamp_created: since, limit: "1" })}`),
        call("GET", "/block-lists-entries?limit=1"),
      ]);
      const why = (r) => (r.ok ? "ok" : `${r.status}${r.detail ? `: ${r.detail}` : ""}`);
      return { leads_read: leads.ok, emails_read: emails.ok, block_list_read: blocks.ok, detail: { leads: why(leads), emails: why(emails), block_list: why(blocks) } };
    },
  };
}
