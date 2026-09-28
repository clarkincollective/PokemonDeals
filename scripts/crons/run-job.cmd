@echo off
rem One scheduled job on this PC (28 Sep 2026): Windows Task Scheduler calls
rem this with the job's /api path (see crons.json, host "pc"); the route
rem handler runs here through scripts/crons/runJob.mjs. runJob appends its
rem own summary line to .local\cron\<job>.log; this wrapper's output (node
rem warnings, crashes) goes to .local\cron\wrap_<job>.log.
rem
rem ONE LOG FILE PER JOB, never a shared one: jobs that fire in the same
rem minute start in the same second, and cmd's ">>" cannot open a file
rem another process already holds - the late starters exited 1 before node
rem ran (measured 28 Sep: every :00/:30 job except the first one to start).
cd /d "C:\Users\James\OneDrive\Desktop\pokemon-deals"
if not exist .local\cron mkdir .local\cron
set "S=%~1"
set "S=%S:/=_%"
set "S=%S:?=_%"
set "S=%S:&=_%"
"C:\Program Files\nodejs\node.exe" --import ./scripts/crons/register.mjs scripts/crons/runJob.mjs "%~1" >> ".local\cron\wrap%S%.log" 2>&1
