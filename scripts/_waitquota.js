require("dotenv").config({ path: ".env.local" });
const { getBrowseRateLimit } = require("../lib/ebay");
(async () => {
  while (true) {
    const rl = await getBrowseRateLimit().catch(() => null);
    const rem = rl && rl.remaining != null ? rl.remaining : -1;
    if (rem >= 2000) { console.log(`QUOTA_READY remaining=${rem}`); process.exit(0); }
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
  }
})();
