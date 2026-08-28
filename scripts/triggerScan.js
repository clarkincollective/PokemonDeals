// Manually kick a scan endpoint on the live site (normally cron-only).
//
//   node scripts/triggerScan.js "refresh-deals?mode=sweep&country=EBAY_AU&pages=8"
//   node scripts/triggerScan.js "refresh-deals?tier=extended&country=EBAY_AU&chunk=1"
//   node scripts/triggerScan.js refresh-catalog
//
// Reads CRON_SECRET from .env.local. If it's not there, copy it from
// Vercel > Project > Settings > Environment Variables.
require("dotenv").config({ path: ".env.local" });

const SITE = process.env.SITE_URL || "https://pokemondealfinder.com";
const secret = process.env.CRON_SECRET;
const pathAndQuery = process.argv[2];

if (!secret) {
  console.error("CRON_SECRET missing from .env.local - copy it from Vercel env vars.");
  process.exit(1);
}
if (!pathAndQuery) {
  console.error('Usage: node scripts/triggerScan.js "refresh-deals?mode=sweep&country=EBAY_AU&pages=8"');
  process.exit(1);
}

const url = `${SITE}/api/${pathAndQuery.replace(/^\/?(api\/)?/, "")}`;
console.log(`GET ${url}`);

const started = Date.now();
fetch(url, { headers: { Authorization: `Bearer ${secret}` } })
  .then(async (res) => {
    const body = await res.text();
    console.log(`${res.status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body.slice(0, 2000));
    }
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
