// SEO Phase 10D closeout - the OUTREACH DELIVERY LAYER, isolated behind
// one interface so the rest of the outreach system (state machine,
// records, render, approval) never knows or cares which provider sends.
//
// WHY THIS EXISTS: Resend's Acceptable Use Policy prohibits unsolicited /
// cold email. The project's Resend integration (lib/email.js) stays
// dedicated to opt-in transactional mail (price-alert confirmations,
// price alerts, the weekly digest). Cold outreach MUST NOT touch it -
// this module deliberately does not import lib/email.js and has no
// reference to RESEND_API_KEY.
//
// A provider implements:
//   name            string
//   isConfigured()   boolean  - env present + usable
//   async send(msg)  -> { sent, id?, reason?, detail? }
//        msg = { to, subject, text, html, replyTo, meta }
//
// Default (nothing configured) = nullProvider: refuses every send.
// The real compliant provider is Instantly (developer.instantly.ai),
// which is purpose-built for cold outreach and whose Sending Policy
// permits low-volume, individually-targeted B2B email to publicly listed
// business contacts with an opt-out.

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";

// --- null provider ---------------------------------------------------
const nullProvider = {
  name: "none",
  isConfigured: () => false,
  async send() {
    return {
      sent: false,
      reason: "no_outreach_provider_configured",
      detail:
        "Set INSTANTLY_API_KEY and INSTANTLY_CAMPAIGN_ID (see the phase report). Cold outreach never uses Resend.",
    };
  },
};

// --- Instantly V2 provider -----------------------------------------
//
// Delivery model: PokemonDealFinder stays the source of truth. Instantly
// is ONLY the compliant delivery + inbox/reply layer. Instantly V2 has
// no true "send one cold email" endpoint - /email/send-test is a preview
// and /email/reply|forward need an existing thread. The provider-intended
// path for a first-contact cold email is a campaign + a lead.
//
// To keep this to the SMALLEST integration and avoid a second CRM, the
// owner pre-creates ONE always-on campaign in the Instantly dashboard:
//   - name: "PokemonDealFinder manual outreach"
//   - a SINGLE sequence step whose subject/body are the custom variables
//     {{outreach_subject}} / {{outreach_body}}  (no follow-up steps)
//   - daily limit 5, assigned to the verified outreach mailbox
// and sets INSTANTLY_CAMPAIGN_ID. Each `send` then adds exactly one lead
// (with the frozen, personalised subject/body as custom variables) to
// that campaign; Instantly delivers it on the campaign schedule.
//
// The exact custom-variable field name in POST /api/v2/leads should be
// confirmed against developer.instantly.ai before the first live send -
// it is called out below. Nothing here runs until the owner configures
// the two env vars, and this task never invokes it (dry-run only).
function instantlyProvider() {
  const apiKey = process.env.INSTANTLY_API_KEY || null;
  const campaignId = process.env.INSTANTLY_CAMPAIGN_ID || null;

  return {
    name: "instantly",
    isConfigured: () => Boolean(apiKey && campaignId),

    async send(msg) {
      if (!apiKey || !campaignId) {
        return { sent: false, reason: "instantly_not_configured" };
      }
      // One lead -> the pre-created single-step campaign. Personalisation
      // is passed as custom variables the campaign's one step references.
      // VERIFY the custom-variable field name (`custom_variables` here)
      // against the live POST /api/v2/leads schema before first use.
      const payload = {
        campaign: campaignId,
        email: msg.to,
        skip_if_in_campaign: true, // provider-side idempotency, on top of ours
        custom_variables: {
          outreach_subject: msg.subject,
          outreach_body: msg.text,
        },
      };
      try {
        const res = await fetch(`${INSTANTLY_BASE}/leads`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return { sent: false, reason: `instantly_${res.status}`, detail: body.slice(0, 300) };
        }
        const json = await res.json().catch(() => ({}));
        // The lead id is our external reference for this send.
        return { sent: true, id: json?.id ?? json?.lead_id ?? null };
      } catch (err) {
        return { sent: false, reason: "instantly_fetch_error", detail: String(err?.message ?? err).slice(0, 200) };
      }
    },
  };
}

// Selection: Instantly if its env is present, else the null provider.
// (A future compliant provider slots in here without touching anything
// else in lib/outreach or scripts/outreach.mjs.)
export function getProvider() {
  const inst = instantlyProvider();
  if (inst.isConfigured()) return inst;
  return nullProvider;
}

// Exposed for tests / diagnostics.
export const _providers = { nullProvider, instantlyProvider };
