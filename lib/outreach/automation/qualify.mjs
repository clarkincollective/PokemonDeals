// OUTREACH-AUTO-1/2 - permission + submission-rule check for a prospect,
// re-run immediately before any first contact.
//
// A public address alone is NOT consent, and a public address plus the
// absence of restrictions is not enough either. A record may be contacted
// only when ALL hold:
//   - eligibility: documented consent, or the address is published for a
//     purpose the message matches (eligibility.mjs), still evidenced live;
//   - no published refusal of this kind of message (pitches, unsolicited,
//     form-only / news-only routes);
//   - the route is email;
//   - the site is relevant (Pokemon / TCG / collecting);
//   - no prior contact, suppression or recorded exclusion (canSend).

import { eligibilityOk } from "./eligibility.mjs";

export const REFUSALS = [
  /not accepting (any )?(pitches|submissions|guest posts|link requests|outreach)/i,
  /(aren'?t|are not|do not|don'?t) (currently )?accept(ing)? (any )?(pitches|submissions|unsolicited|guest posts|link)/i,
  /no (unsolicited|cold) (email|pitches|outreach|messages)/i,
  /(please )?do not (send|email) (us )?(pitches|press releases|link requests|seo|marketing)/i,
  /(link|backlink|seo) (requests?|outreach) will (be ignored|not be answered)/i,
  /contact (us )?(only )?(via|through|using) (our|the) (contact )?form/i,
  /(news tips|press releases) only/i,
];
const RELEVANT = /(pok[eé]mon|tcg|trading card|card game|collect)/i;

export const pageText = (h) => String(h).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#8217;|&rsquo;|&#x27;|’/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

// pure part - exported for tests
export function assessPages({ recipient, pages, record = null }) {
  const all = pages.map((p) => p.text).join(" ");
  const problems = [];
  const published = pages.some((p) => p.text.toLowerCase().includes(String(recipient).toLowerCase()));
  if (!published) problems.push("recipient address not published on the recorded contact page");
  for (const rx of REFUSALS) { const m = all.match(rx); if (m) problems.push(`published refusal: "${m[0]}"`); }
  if (!RELEVANT.test(all)) problems.push("site not evidently relevant to Pokemon / TCG collecting");
  if (record) {
    const ev = pages.find((p) => p.url === record.eligibility?.evidenceUrl) ?? { text: all };
    const e = eligibilityOk(record, ev.text);
    if (!e.ok) problems.push(`eligibility: ${e.reason}`);
  }
  return { ok: problems.length === 0, published, problems };
}

export async function fetchPage(url, { fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; pokemondealfinder-outreach-check/1.0)" }, signal: AbortSignal.timeout(20000) });
    return { url, status: r.status, text: r.ok ? pageText(await r.text()) : "" };
  } catch {
    return { url, status: 0, text: "" };
  }
}

export async function checkPermission(record, { fetchImpl = fetch } = {}) {
  if (record.contactType !== "EMAIL") return { ok: false, problems: [`route is ${record.contactType} - never emailed`] };
  const urls = [...new Set([record.contactSourceUrl, record.eligibility?.evidenceUrl, ...(record.rulesUrls ?? [])].filter(Boolean))];
  if (!urls.length) return { ok: false, problems: ["no recorded contact source page"] };
  const pages = [];
  // eslint-disable-next-line no-await-in-loop
  for (const u of urls) pages.push(await fetchPage(u, { fetchImpl }));
  if (!pages[0]?.text) return { ok: false, problems: [`contact page unreachable (${pages[0]?.status})`] };
  return { ...assessPages({ recipient: record.recipient, pages, record }), checkedAt: new Date().toISOString() };
}
