@echo off
rem Second-board capture wrapper for Windows Task Scheduler (2026-09-27).
rem Runs scripts/boards/captureJimmy.mjs from the repo root so .env.local is
rem found, and appends every run to .local\board-capture.log.
rem   Quick (Today lists):  capture-jimmy.cmd
rem   Full (every list):    capture-jimmy.cmd --full
cd /d "C:\Users\James\OneDrive\Desktop\pokemon-deals"
if not exist .local mkdir .local
echo ==== %DATE% %TIME% %* >> .local\board-capture.log
"C:\Program Files\nodejs\node.exe" scripts\boards\captureJimmy.mjs %* >> .local\board-capture.log 2>&1
