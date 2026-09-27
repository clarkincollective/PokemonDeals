@echo off
rem Scheduled-job tick for Windows Task Scheduler (28 Sep 2026): every minute,
rem start whichever crons.json jobs (host "pc") are due. Each job runs
rem detached with its own lock, timeout and log under .local\cron\.
cd /d "C:\Users\James\OneDrive\Desktop\pokemon-deals"
if not exist .local\cron mkdir .local\cron
"C:\Program Files\nodejs\node.exe" scripts\crons\tick.mjs %* >> .local\cron\tick.log 2>&1
