@echo off
rem Local (free) visual-authenticity Stage 2 for Windows Task Scheduler (27 Sep 2026).
rem Runs scripts/visual/screenLocal.mjs from the repo root so .env.local is
rem found, and appends every run to .local\visual-screen.log.
rem   Hourly queue pass:   screen-local.cmd
rem   Specific rows:       screen-local.cmd --ids=42912,12750
rem   Report only:         screen-local.cmd --dry
cd /d "C:\Users\James\OneDrive\Desktop\pokemon-deals"
if not exist .local mkdir .local
echo ==== %DATE% %TIME% %* >> .local\visual-screen.log
"C:\Program Files\nodejs\node.exe" scripts\visual\screenLocal.mjs %* >> .local\visual-screen.log 2>&1
