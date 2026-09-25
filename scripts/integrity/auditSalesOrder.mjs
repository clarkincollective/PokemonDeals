// Finding 9 reproduction — read-only. Fetches PRODUCTION deal pages (already
// ISR-cached and served to any visitor; no provider call is made by this
// script, no affiliate URL is ever requested) and extracts the "Recent eBay
// sales" dates IN DISPLAY ORDER, to test whether the list the page calls
// "Recent" is actually ordered by sale date.
const BASE = "https://pokemondealfinder.com";
const ids = process.argv.slice(2);

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function salesSection(html) {
  // The RecentSales <section> — anchored on its own heading text.
  const h = html.search(/(?:Recent|Latest recorded) (?:raw )?eBay sales/);
  if (h < 0) return null;
  const end = html.indexOf("</section>", h);
  return html.slice(h, end < 0 ? h + 40000 : end);
}

// Each <li> shows "<Month> <day>, <year> &middot; <listingType>".
function datesInOrder(section) {
  const out = [];
  const re = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/g;
  let m;
  while ((m = re.exec(section))) {
    const mo = MONTHS[m[1]];
    if (mo === undefined) continue;
    out.push({ text: `${m[1]} ${m[2]}, ${m[3]}`, t: Date.UTC(+m[3], mo, +m[2]) });
  }
  return out;
}

let checked = 0;
let outOfOrder = 0;
let truncatedAndUnordered = 0;
const shapes = {};
const lags = [];

for (const id of ids) {
  const url = `${BASE}/deals/${id}`;
  let html;
  try {
    const res = await fetch(url, { headers: { "user-agent": "pdf-internal-audit/finding9" } });
    if (!res.ok) { console.log(`${id}: HTTP ${res.status}`); continue; }
    html = await res.text();
  } catch (err) {
    console.log(`${id}: fetch failed — ${err.message}`);
    continue;
  }

  const section = salesSection(html);
  if (!section) { console.log(`${id}: no recent-sales section rendered`); continue; }
  const dates = datesInOrder(section);
  if (dates.length < 2) { console.log(`${id}: ${dates.length} dated row(s) — not orderable`); continue; }

  checked++;
  const descending = dates.every((d, i) => i === 0 || dates[i - 1].t >= d.t);
  const ascending = dates.every((d, i) => i === 0 || dates[i - 1].t <= d.t);
  const shape = descending ? "descending" : ascending ? "ASCENDING" : "mixed";
  const sorted = [...dates].sort((a, b) => b.t - a.t);
  if (!descending) outOfOrder++;
  shapes[shape] = (shapes[shape] ?? 0) + 1;
  // Days between the sale the page LEADS with and the newest it actually holds.
  const lag = Math.round((sorted[0].t - dates[0].t) / 86400000);
  if (lag > 0) lags.push(lag);
  // The list is truncated at `limit`; a full list is the case where newer
  // sales can have been dropped by slicing an unordered array.
  const full = dates.length >= 8;
  if (full && !descending) truncatedAndUnordered++;

  console.log(
    `${id}  rows=${String(dates.length).padStart(2)}  ${shape.padEnd(10)}  ` +
      `leads ${dates[0].text.padEnd(13)} newest ${sorted[0].text.padEnd(13)} ` +
      `lag ${String(lag).padStart(3)}d${full ? "  [full 8 — truncated]" : ""}`
  );
}

const med = lags.length ? [...lags].sort((a, b) => a - b)[Math.floor(lags.length / 2)] : 0;
console.log(`\n=== ${checked} orderable list(s); ${outOfOrder} NOT newest-first (${((outOfOrder / checked) * 100).toFixed(0)}%)`);
console.log(`    order shapes: ${JSON.stringify(shapes)}`);
console.log(`    of those, ${truncatedAndUnordered} are BOTH unordered AND full at the 8-row limit`);
console.log(`    lag between the sale shown first and the newest sale present: median ${med}d, max ${Math.max(0, ...lags)}d`);
