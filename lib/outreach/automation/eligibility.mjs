// OUTREACH-AUTO-2 - recipient ELIGIBILITY. A publicly listed address plus the
// absence of restrictions is NOT enough. First contact needs one of:
//
//   documented_consent               the person asked to hear from us (consentRef
//                                    points at the recorded request)
//   role_relevant_published_purpose  the address is published FOR the kind of
//                                    message we send (press, tips, reviews,
//                                    submissions, resource suggestions, editorial
//                                    or data/research enquiries), and the message
//                                    matches that published purpose
//
// The evidence quote must still be on the evidence page at send time.

export const FREE_MAIL_DOMAINS = Object.freeze(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "gmx.com", "zoho.com", "yandex.com", "mail.com"]);
export const isFreeMail = (domain) => FREE_MAIL_DOMAINS.includes(String(domain ?? "").toLowerCase());

// published purposes our messages can legitimately match
export const PURPOSE_RX = /(press|media|journalis|news ?tips?|tips?\b|story ideas?|review(s| requests?| copies)?|reviewed|submi(t|ssions?)|suggest(ions?| a (resource|site|link))|resources?|contribut|editorial|feature (requests?|your)|get featured|coverage|research|data enquir|collaborat)/i;
const ADVERTISING_ONLY_RX = /^(?!.*(press|review|submi|editorial|tips|resource|research)).*(advertis|sponsor|affiliate|media kit|rate card)/i;

export const normalise = (s) => String(s ?? "").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/&#8217;|&rsquo;|&#x27;/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

// find a published purpose statement tied to the address: the clause that
// introduces the address (up to 160 chars before it, from the last sentence or
// label boundary) must itself state a purpose our message matches. Navigation
// text, site titles and a bare "Contact" heading never qualify.
export function findPurposeEvidence(pageText, address) {
  // returns an EXACT substring of the page (so it can be re-verified live later)
  const text = String(pageText ?? "").replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const addr = String(address).toLowerCase();
  const hasLowerWords = (s) => s.split(" ").some((w) => /^[a-z]{3,}/.test(w));
  let from = 0;
  for (;;) {
    const idx = lower.indexOf(addr, from);
    if (idx < 0) return null;
    const winStart = Math.max(0, idx - 160);
    const before = text.slice(winStart, idx);
    const bounds = [0];
    const rx = /(?:[.!?|:]\s|\d+\s+(?:business\s+)?days?\s|\s[-–]\s)/g;
    for (let m; (m = rx.exec(before)); ) bounds.push(m.index + m[0].length);
    let start = bounds[bounds.length - 1];
    if (before.slice(start).trim().split(" ").filter(Boolean).length < 4 && bounds.length > 1) start = bounds[bounds.length - 2];
    const clause = before.slice(start).trim();
    const words = clause.split(" ").filter(Boolean);
    const capsRatio = words.filter((w) => /^[A-Z&]/.test(w)).length / Math.max(1, words.length);
    const navLike = words.length > 22 || !hasLowerWords(clause) || (words.length > 5 && capsRatio > 0.5);
    if (clause.length >= 5 && PURPOSE_RX.test(clause) && !ADVERTISING_ONLY_RX.test(clause) && !navLike) {
      return text.slice(winStart + before.indexOf(clause, start), idx + addr.length).trim().slice(0, 240);
    }
    from = idx + addr.length;
  }
}

// pure: is the recorded basis sufficient and still evidenced on the fetched page?
export function eligibilityOk(record, evidencePageText) {
  const e = record?.eligibility;
  if (!e || !e.basis) return { ok: false, reason: "no documented consent or role-relevant published purpose recorded" };
  if (e.basis === "documented_consent") return e.consentRef ? { ok: true } : { ok: false, reason: "documented consent has no consentRef" };
  if (e.basis !== "role_relevant_published_purpose") return { ok: false, reason: `unsupported basis ${e.basis}` };
  if (!e.evidenceUrl || !e.evidenceQuote || !e.purposeMatch) return { ok: false, reason: "role-relevant basis needs evidenceUrl, evidenceQuote and purposeMatch" };
  if (!PURPOSE_RX.test(e.evidenceQuote)) return { ok: false, reason: "evidence quote does not state a purpose our message matches" };
  if (!normalise(evidencePageText).includes(normalise(e.evidenceQuote))) return { ok: false, reason: "evidence quote no longer on the evidence page" };
  if (!normalise(evidencePageText).includes(String(record.recipient).toLowerCase())) return { ok: false, reason: "recipient address no longer published on the evidence page" };
  return { ok: true };
}
