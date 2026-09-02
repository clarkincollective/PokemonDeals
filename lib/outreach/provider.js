// SEO Phase 10D closeout - the OUTREACH DELIVERY LAYER, isolated behind
// one interface so the rest of the outreach system (state machine,
// records, render, approval) never knows or cares which provider sends.
//
// WHY THIS EXISTS: the project's transactional mailer's Acceptable Use
// Policy prohibits unsolicited / cold email. That integration stays
// dedicated to opt-in transactional mail. Cold outreach MUST NOT touch
// it - this module deliberately does not import that mailer and holds no
// reference to its credential.
//
// A provider implements:
//   name                       string
//   isConfigured()             boolean  - env present + usable
//   async submitLead(msg)      -> { accepted, id?, reason?, detail? }
//        msg = { to, subject, text, html, replyTo, meta }
//   async getLeadStatus(ref)   -> normalised reading:
//        { ok, sent, sentAt, bounced, unsubscribed, leadStatusRaw, reason? }
//
// Default (nothing configured) = nullProvider: refuses everything.
//
// The compliant provider is Instantly (developer.instantly.ai). Instantly
// V2 has no "send one cold email" endpoint - the provider-intended unit
// for a first-contact cold email is a campaign + a lead. The owner
// pre-creates ONE always-on campaign whose single step is:
//     subject:  {{outreach_subject}}
//     body:     {{outreach_body}}
// (Instantly campaign steps reference a lead's custom variables with the
//  {{name}} syntax - verified against help.instantly.ai). Each submit
// adds exactly ONE lead to that campaign with those two custom variables;
// Instantly then sends on the campaign schedule from the warmed mailbox.

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

// --- null provider ---------------------------------------------------
const nullProvider = {
  name: "none",
  isConfigured: () => false,
  async submitLead() {
    return {
      accepted: false,
      reason: "no_outreach_provider_configured",
      detail:
        "Set INSTANTLY_API_KEY and INSTANTLY_CAMPAIGN_ID (see the phase report). Cold outreach never uses the transactional mailer.",
    };
  },
  async getLeadStatus() {
    return { ok: false, reason: "no_outreach_provider_configured" };
  },
};

// --- Instantly V2 provider ----------------------------------------
//
// CONTRACT (verified against developer.instantly.ai/api-reference/lead/
// create-lead - POST /api/v2/leads, all fields optional):
//   campaign            string(uuid)   - the campaign to add the lead to
//   email               string
//   custom_variables    object<string, string|number|boolean|null>
//   skip_if_in_campaign boolean        - provider-side dedupe guard
// The response is a Lead object; we keep its `id` as our external ref.
//
// SEND EVIDENCE (verified against the Lead schema): there is NO dedicated
// "sent" field. The reliable signals that an email actually went out:
//   - timestamp_last_contact  (non-null once the campaign has emailed the lead)
//   - status_summary.lastStep.timestamp_executed  (last step actually ran)
//   - status == -1 Bounced ; status == -2 Unsubscribed
// getLeadStatus() reads GET /api/v2/leads/:id and normalises these.
function instantlyProvider() {
  const apiKey = process.env.INSTANTLY_API_KEY || null;
  const campaignId = process.env.INSTANTLY_CAMPAIGN_ID || null;

  const headers = () => ({
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  });

  return {
    name: "instantly",
    isConfigured: () => Boolean(apiKey && campaignId),

    // Create ONE lead in the pre-created single-step campaign.
    async submitLead(msg) {
      if (!apiKey || !campaignId) return { accepted: false, reason: "instantly_not_configured" };
      const leadBody = {
        campaign: campaignId,
        email: msg.to,
        skip_if_in_campaign: true,
        custom_variables: {
          outreach_subject: msg.subject,
          outreach_body: msg.text,
        },
      };
      try {
        const res = await fetch(`${INSTANTLY_BASE}/leads`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(leadBody),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { accepted: false, reason: `instantly_${res.status}`, detail: body.slice(0, 300) };
        }
        const json = await res.json().catch(() => ({}));
        // A created lead means ACCEPTED into the campaign - NOT that an
        // email has been sent. The caller lands the record on QUEUED.
        return { accepted: true, id: json?.id ?? null };
      } catch (err) {
        return {
          accepted: false,
          reason: "instantly_fetch_error",
          detail: String(err?.message ?? err).slice(0, 200),
        };
      }
    },

    // Read the lead and decide whether Instantly has actually sent it.
    async getLeadStatus(ref) {
      if (!apiKey) return { ok: false, reason: "instantly_not_configured" };
      if (!ref) return { ok: false, reason: "no_provider_ref" };
      try {
        const res = await fetch(`${INSTANTLY_BASE}/leads/${encodeURIComponent(ref)}`, {
          headers: headers(),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { ok: false, reason: `instantly_${res.status}`, detail: body.slice(0, 200) };
        }
        const lead = await res.json().catch(() => ({}));
        return normaliseLeadStatus(lead);
      } catch (err) {
        return { ok: false, reason: "instantly_fetch_error", detail: String(err?.message ?? err).slice(0, 200) };
      }
    },
  };
}

// Pure - exported for tests. Maps a raw Instantly Lead object to the
// normalised evidence shape core.applySyncResult() consumes.
export function normaliseLeadStatus(lead = {}) {
  const raw = typeof lead.status === "number" ? lead.status : null;
  const bounced = raw === -1;
  const unsubscribed = raw === -2;
  // Prefer the explicit "last step executed" timestamp; fall back to
  // "last contact with the lead". Either being present = an email went.
  const stepTs =
    lead?.status_summary?.lastStep?.timestamp_executed ??
    lead?.status_summary?.lastStep?.timestamp ??
    lead?.status_summary?.timestamp_executed ??
    null;
  const sentAt = stepTs || lead?.timestamp_last_contact || null;
  const sent = Boolean(sentAt) && !bounced;
  return { ok: true, sent, sentAt: sent ? sentAt : null, bounced, unsubscribed, leadStatusRaw: raw };
}

// Selection: Instantly if its env is present, else the null provider.
export function getProvider() {
  const inst = instantlyProvider();
  if (inst.isConfigured()) return inst;
  return nullProvider;
}

// Exposed for tests / diagnostics.
export const _providers = { nullProvider, instantlyProvider };
