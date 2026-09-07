#!/usr/bin/env bash
# Wait until the eBay Browse quota can absorb the image recovery, then run it once.
cd "$(dirname "$0")/.."
for i in $(seq 1 96); do
  q=$(node -e "require('dotenv').config({path:'.env.local'});require('./lib/ebay.js').getBrowseRateLimit().then(r=>console.log((r&&r.remaining)||0)).catch(()=>console.log(0))" 2>/dev/null | tail -1)
  echo "$(date -u +%H:%M) quota=$q"
  if [ "${q:-0}" -ge 1000 ]; then
    echo "RUNNING recovery --apply"
    node scripts/_screenDealImages.mjs --recover --apply 2>&1
    exit 0
  fi
  sleep 600
done
echo "gave up waiting for quota"
exit 1
