#!/usr/bin/env node
// Generates the Windows Task Scheduler registration for every crons.json job
// with host "pc": one task per job, its UTC schedule converted to this
// machine's local time (fixed offset, no DST - E. Australia Standard Time).
//
//   node scripts/crons/registerTasks.mjs            # writes .local/cron/register-tasks.ps1
//   then run it:  powershell -NoProfile -File .local/cron/register-tasks.ps1
//
// Re-run both after editing crons.json. Each task calls
// scripts/crons/run-job.cmd "<path>" (see runJob.mjs). Settings: 30-minute
// execution limit, no overlapping instances, run when available, network
// required.
//
// 2 Oct 2026 bug: Register-ScheduledTask -Force with no -Principal resets
// an ALREADY-S4U task's LogonType back to Interactive (silently undid the
// 28 Sep elevated conversion for all 26 existing tasks the next time this
// generator ran). Fixed: for a task that already exists, use Set-ScheduledTask
// instead, which only touches the properties it is given and leaves the
// existing Principal (and therefore LogonType) alone.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cronMatches } from "./cronMatch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const OFFSET_MIN = Number(process.env.PC_UTC_OFFSET_MINUTES ?? 600); // +10:00
const cmd = join(REPO, "scripts", "crons", "run-job.cmd"); // backslashes on Windows
const cfg = JSON.parse(readFileSync(join(REPO, "crons.json"), "utf8"));

const hhmm = (mm) => `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
const lines = [
  '$ErrorActionPreference = "Stop"',
  "$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew -StartWhenAvailable -RunOnlyIfNetworkAvailable",
  "$today = (Get-Date).Date",
  `$cmd = '${cmd}'`,
];
const summary = [];
for (const job of cfg.crons.filter((c) => c.host === "pc")) {
  const fires = [];
  for (let m = 0; m < 1440; m++) if (cronMatches(job.schedule, Date.UTC(2026, 8, 28, 0, m))) fires.push((m + OFFSET_MIN) % 1440);
  fires.sort((a, b) => a - b);
  const slug = job.path.replace(/^\/api\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 100);
  const name = `PokemonDealFinder-Job-${slug}`;
  let triggers;
  if (fires.length <= 2) {
    triggers = fires.map((mm) => `(New-ScheduledTaskTrigger -Daily -At $today.AddMinutes(${mm}))`);
  } else {
    const gaps = new Set();
    for (let i = 1; i < fires.length; i++) gaps.add(fires[i] - fires[i - 1]);
    gaps.add(1440 - fires[fires.length - 1] + fires[0]);
    if (gaps.size !== 1) throw new Error(`${job.path}: firing minutes are not evenly spaced in local time (${[...gaps].join(",")})`);
    triggers = [`(New-ScheduledTaskTrigger -Once -At $today.AddMinutes(${fires[0]}) -RepetitionInterval (New-TimeSpan -Minutes ${[...gaps][0]}))`];
  }
  lines.push(`$action = New-ScheduledTaskAction -Execute $cmd -Argument '"${job.path.replace(/'/g, "")}"'`);
  lines.push(`$triggers = @(${triggers.join(", ")})`);
  lines.push(`$desc = '${job.schedule} UTC -> ${job.path} (crons.json, runs on this PC)'`);
  lines.push(`if (Get-ScheduledTask -TaskName '${name}' -ErrorAction SilentlyContinue) {`);
  lines.push(`  Set-ScheduledTask -TaskName '${name}' -Action $action -Trigger $triggers -Settings $settings | Out-Null`);
  lines.push(`  Write-Output 'updated ${name}'`);
  lines.push(`} else {`);
  lines.push(`  Register-ScheduledTask -TaskName '${name}' -Action $action -Trigger $triggers -Settings $settings -Description $desc | Out-Null`);
  lines.push(`  Write-Output 'registered ${name}'`);
  lines.push(`}`);
  summary.push(`${name}  ${job.schedule} UTC  fires/day=${fires.length}${fires.length <= 2 ? " at " + fires.map(hhmm).join(",") : ""}`);
}
mkdirSync(join(REPO, ".local", "cron"), { recursive: true });
writeFileSync(join(REPO, ".local", "cron", "register-tasks.ps1"), lines.join("\r\n") + "\r\n");
console.log(summary.join("\n"));
console.log(`\nwrote .local/cron/register-tasks.ps1 (${cmd})`);
