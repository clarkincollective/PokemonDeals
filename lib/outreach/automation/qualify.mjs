// OUTREACH-AUTO-1 - permission basis + submission-rule check for a prospect,
// re-run immediately before any first contact.
//
// A public address alone is NOT consent. A record may be contacted only when:
//   - the exact recipient address is conspicuously published on the page
//     recorded as the contact source (contactSourceUrl), and that page (or
//     the recorded rules page) does not refuse this kind of message;
//   - the route is email (form-only / news-only routes are never emailed);
//   - the site is relevant (Pokemon / TCG / collecting);
//   - there is no prior contact, suppression or recorded exclusion;
//   - the message is personalised around one verified asset.

const REFUSALS = [
  /not accepting (any )?(pitches|submissions|guest posts|link requests|outreach)/i,
  /(aren'?t|are not|do not|don'?t) (currently )?accept(ing)? (any )?(pitches|submissions|unsolicited|guest posts|link)/i,
  /no (unsolicited|cold) (email|pitches|outreach|messages)/i,
  /(please )?do not (send|email) (us )?(pitches|press releases|link requests|seo|marketing)/i,
  /(link|backlink|seo) (requests?|outreach) will (be ignored|not be answered)/i,
  /contact (us )?(only )?(via|through|using) (our|the) (contact )?form/i,
  /(news tips|press releases) only/i,
];
const RELEVANT = /(pok[eé]mon|tcg|trading card|card game|collect)/i;

const text = (h) => String(h).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&#8217;|&rsquo;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

// pure part - exported for tests
export function assessPages({ recipient, pages }) {
  const all = pages.map((p) => p.text).join(" ");
  const problems = [];
  const published = pages.some((p) => p.text.toLowerCase().includes(String(recipient).toLowerCase()));
  if (!published) problems.push("recipient address not published on the recorded contact page");
  for (const rx of REFUSALS) { const m = all.match(rx); if (m) problems.push(`published refusal: "${m[0]}"`); }
  if (!RELEVANT.test(all)) problems.push("site not evidently relevant to Pokemon / TCG collecting");
  return { ok: problems.length === 0, published, problems };
}

export async function checkPermission(record, { fetchImpl = fetch } = {}) {
  if (record.contactType !== "EMAIL") return { ok: false, problems: [`route is ${record.contactType} - never emailed`] };
  const urls = [record.contactSourceUrl, ...(record.rulesUrls ?? [])].filter(Boolean);
  if (!urls.length) return { ok: false, problems: ["no recorded contact source page"] };
  const pages = [];
  for (const u of urls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetchImpl(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; pokemondealfinder-outreach-check/1.0)" }, signal: AbortSignal.timeout(20000) });
      // eslint-disable-next-line no-await-in-loop
      pages.push({ url: u, status: r.status, text: r.ok ? text(await r.text()) : "" });
    } catch (e) {
      pages.push({ url: u, status: 0, text: "" });
    }
  }
  if (!pages[0]?.text) return { ok: false, problems: [`contact page unreachable (${pages[0]?.status})`] };
  return { ...assessPages({ recipient: record.recipient, pages }), checkedAt: new Date().toISOString() };
}
