@echo off
rem One scheduled job on this PC (28 Sep 2026): Windows Task Scheduler calls
rem this with the job's /api path (see crons.json, host "pc"); the route
rem handler runs here through scripts/crons/runJob.mjs. runJob appends its
rem own summary line to .local\cron\<job>.log; anything else (warnings,
rem crashes) lands in .local\cron\run-job.log.
cd /d "C:\Users\James\OneDrive\Desktop\pokemon-deals"
if not exist .local\cron mkdir .local\cron
"C:\Program Files\nodejs\node.exe" --import ./scripts/crons/register.mjs scripts/crons/runJob.mjs "%~1" >> .local\cron\run-job.log 2>&1
