// OUTREACH-AUTO-1 - classify one incoming email. PURE (no network).
//
// Only mail from a KNOWN outreach correspondent is ever considered; every
// other received message (warm-up traffic, newsletters, strangers) is
// IGNORED. Deterministic rules run first; only a genuine human message that
// is not an opt-out, decline, bounce or escalation topic reaches Claude.

export const CATEGORY = Object.freeze({
  IGNORE_UNKNOWN_SENDER: "IGNORE_UNKNOWN_SENDER",
  IGNORE_OWN: "IGNORE_OWN",
  IGNORE_AUTO: "IGNORE_AUTO", // auto-acknowledgement / ticket receipt
  IGNORE_OOO: "IGNORE_OOO",
  BOUNCE: "BOUNCE",
  OPT_OUT: "OPT_OUT",
  DECLINE: "DECLINE",
  ESCALATE: "ESCALATE",
  COVERAGE: "COVERAGE",
  ROUTINE: "ROUTINE",
});

const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon|bounce[s]?|no-?reply-?bounce)@/i;
const BOUNCE_SUBJ = /(undeliver|delivery status notification|delivery (has )?failed|returned mail|failure notice|mail delivery (failed|subsystem)|address not found|message not delivered)/i;
const OOO = /(out of (the )?office|on (annual |parental )?leave|away (from|until)|auto(matic)?[- ]?reply|currently (away|travell?ing|unavailable)|limited access to (my )?email|back in the office|vacation)/i;
const AUTO_ACK = /(ticket (has been )?(created|received|#)|we('ve| have) received your (message|email|request)|this is an automated|do not reply to this|thank you for contacting .{0,40}(we will|we'll) (get back|respond)|your request \(#?\d+\)|case number|support request received)/i;
const OPT_OUT = /(\bno thanks\b|\bno,? thank you\b|unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (email|contact)|don'?t (email|contact) (me|us)|opt[- ]?out|not interested|leave (me|us) alone|spam)/i;
const DECLINE = /(not (taking|accepting) (on )?(new )?(partnerships|submissions|pitches|guest posts|link requests)|we (don'?t|do not) (accept|link|add|feature)|(we'll|we will) pass|not (a )?(good )?fit|decline|no longer (updating|accepting)|not at this time|keep (your|you) (details|information) on file)/i;
const ESCALATE_RX = [
  [/(\bprice\b|\bpricing\b|\bfee\b|\bcost\b|\brates?\b|\bpay(ment|ing|)\b|\bpaid\b|\binvoice\b|\bsponsor(ed|ship)?\b|\$\s?\d|€\s?\d|£\s?\d|\bUSD\b|budget|quote)/i, "payment"],
  [/(contract|agreement|terms of (service|partnership)|\bnda\b|sign(ed|ing)? (a|the)|legal)/i, "contract"],
  [/(link exchange|exchange links|reciprocal|link back to (us|our)|swap links|link swap|in return.{0,30}link|guest post)/i, "reciprocal_link"],
  [/(password|login|log in|credentials|bank|account number|tax (id|number)|ssn|passport|phone number|home address|date of birth|verify your (account|identity))/i, "sensitive_information"],
  [/(dofollow|do-follow|anchor text|nofollow)/i, "link_attributes"],
  [/(interview|podcast|call|meeting|zoom|phone)/i, "meeting_request"],
];
const COVERAGE = /((added|included|featured|mentioned|linked( to)?|listed|cited|published|updated) (you|your (site|tool|resource|study|guide|checklist)|pokemon ?deal ?finder|it)|here('s| is) the (link|article|post)|now live|went live)/i;

const addr = (s) => String(s ?? "").trim().toLowerCase();
const domain = (s) => addr(s).split("@")[1] ?? "";

// email: Instantly email object; ctx: { ownEmails:[], ownDomains:[], knownRecipients: Map(email|domain -> record) }
export function classifyIncoming(email, ctx) {
  const from = addr(email.from_address_email);
  const subject = String(email.subject ?? "");
  const text = latestText(email);
  const known = ctx.knownRecipients.get(from) ?? ctx.knownRecipients.get(domain(from)) ?? (email.lead ? ctx.knownRecipients.get(addr(email.lead)) : null);

  if (ctx.ownEmails.includes(from) || ctx.ownDomains.includes(domain(from))) return { category: CATEGORY.IGNORE_OWN };
  if (BOUNCE_FROM.test(from) || BOUNCE_SUBJ.test(subject)) {
    return known ? { category: CATEGORY.BOUNCE, record: known } : { category: CATEGORY.IGNORE_UNKNOWN_SENDER };
  }
  if (!known) return { category: CATEGORY.IGNORE_UNKNOWN_SENDER };
  if (OOO.test(subject) || OOO.test(text.slice(0, 600))) return { category: CATEGORY.IGNORE_OOO, record: known };
  if (email.is_auto_reply || AUTO_ACK.test(subject) || AUTO_ACK.test(text.slice(0, 800))) return { category: CATEGORY.IGNORE_AUTO, record: known };
  if (OPT_OUT.test(text)) return { category: CATEGORY.OPT_OUT, record: known };
  const esc = ESCALATE_RX.filter(([rx]) => rx.test(text)).map(([, why]) => why);
  if (esc.length) return { category: CATEGORY.ESCALATE, record: known, reasons: esc };
  if (DECLINE.test(text)) return { category: CATEGORY.DECLINE, record: known };
  if (COVERAGE.test(text)) return { category: CATEGORY.COVERAGE, record: known };
  return { category: CATEGORY.ROUTINE, record: known };
}

// The correspondent's newest words only (quoted history below is ours).
export function latestText(email) {
  const raw = String(email.body?.text ?? email.content_preview ?? stripHtml(email.body?.html ?? ""));
  const cut = raw.search(/\n\s*(on .{5,120}wrote:|-{2,}\s*original message|from:\s.+\n\s*sent:|>\s)/i);
  return (cut > 0 ? raw.slice(0, cut) : raw).trim().slice(0, 4000);
}
function stripHtml(h) {
  return String(h).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<blockquote[\s\S]*$/i, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
}
