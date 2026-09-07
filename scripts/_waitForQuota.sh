#!/usr/bin/env bash
# 13E.5 post-quota verification waiter. Polls Browse quota every ~15 min;
# exits 0 once quota is safely above the recovery reserve so the phase can
# resume its verification. Makes NO eBay Browse calls of its own (the
# rate-limit read is free). Read-only.
set -u
cd "$(dirname "$0")/.."
THRESHOLD=1500
for i in $(seq 1 40); do
  Q=$(node --input-type=module -e 'import{config}from"dotenv";config({path:".env.local",quiet:true});import{getBrowseRateLimit}from"./lib/ebay.js";const r=await getBrowseRateLimit();process.stdout.write(String(r&&r.remaining!=null?r.remaining:-1))' 2>/dev/null)
  TS=$(date -u +"%H:%M")
  echo "$TS quota=$Q"
  if [ "$Q" -ge "$THRESHOLD" ] 2>/dev/null; then
    echo "QUOTA RECOVERED ($Q >= $THRESHOLD) - resume verification"
    exit 0
  fi
  sleep 900
done
echo "gave up after ~10h without recovery"
exit 1
