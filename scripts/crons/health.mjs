#!/usr/bin/env node
// PC job health (28 Sep 2026). Everything scheduled now runs on this
// machine, so this is the one place that says whether it is alive:
//
//   node scripts/crons/health.mjs          # print the report, write it, publish the heartbeat
//   node scripts/crons/health.mjs --print  # print only
//
// For every crons.json job with host "pc" it reads the last summary line
// in .local/cron/<slug>.log, compares it with the job's schedule (a job is
// STALE when its last run is older than 2x its firing interval + 15 min;
// daily jobs get 26 h), and reports the last status. The report goes to
// .local/cron/health.json and to catalog_snapshot kind "pc_health" (so it
// can be read from anywhere with the service key). Also trims any
// .local/cron log over 5 MB to its last 1 MB. Never throws.
import "./dnsFix.mjs";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, truncateSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseCron } from "./cronMatch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
process.chdir(REPO);
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const PRINT_ONLY = process.argv.includes("--print");
const DIR = ".local/cron";

const slugOf = (p) => p.replace(/^\/api\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 120);

// firing interval in minutes, from the schedule's minute/hour sets
function intervalMinutes(schedule) {
  const c = parseCron(schedule);
  const perDay = c.minute.size * c.hour.size;
  return perDay > 0 ? Math.round(1440 / perDay) : 1440;
}

function lastSummary(slug) {
  const file = join(DIR, `${slug}.log`);
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(\S+) (\{.*\})$/.exec(lines[i]);
    if (!m) continue;
    try {
      const j = JSON.parse(m[2]);
      return { at: m[1], status: j.status, http: j.http, tookMs: j.tookMs, skipped: j.response?.skipped ?? null, error: j.error ?? null };
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function trimLogs() {
  let trimmed = 0;
  try {
    for (const name of readdirSync(DIR)) {
      if (!name.endsWith(".log")) continue;
      const file = join(DIR, name);
      const size = statSync(file).size;
      if (size <= 5 * 1024 * 1024) continue;
      const keep = 1024 * 1024;
      const fd = openSync(file, "r");
      const buf = Buffer.alloc(keep);
      readSync(fd, buf, 0, keep, size - keep);
      closeSync(fd);
      writeFileSync(file, buf.toString("utf8").replace(/^[^\n]*\n/, ""));
      trimmed++;
    }
  } catch {
    /* best effort */
  }
  return trimmed;
}

const cfg = JSON.parse(readFileSync("crons.json", "utf8"));
const now = Date.now();
const jobs = [];
for (const job of cfg.crons.filter((c) => c.host === "pc")) {
  const slug = slugOf(job.path);
  const last = lastSummary(slug);
  const interval = intervalMinutes(job.schedule);
  const allowance = interval >= 720 ? 26 * 60 : 2 * interval + 15;
  const ageMin = last ? Math.round((now - Date.parse(last.at)) / 60000) : null;
  const registeredMinutesAgo = Math.round((now - Date.parse("2026-09-27T21:43:00Z")) / 60000); // when the tasks first ran correctly
  const stale = last ? ageMin > allowance : registeredMinutesAgo > allowance;
  jobs.push({ path: job.path, schedule: job.schedule, intervalMin: interval, lastRunAt: last?.at ?? null, ageMin, lastStatus: last?.status ?? "never", skipped: last?.skipped ?? null, error: last?.error ?? null, stale });
}
const extras = [];
for (const [name, file, allowanceMin] of [["visual-screen", ".local/visual-screen.log", 150], ["board-capture", ".local/board-capture.log", 75]]) {
  let at = null;
  try {
    const text = readFileSync(file, "utf8");
    const m = [...text.matchAll(/"at":\s*"([^"]+)"/g)].at(-1);
    at = m?.[1] ?? null;
  } catch {
    /* no log */
  }
  const ageMin = at ? Math.round((now - Date.parse(at)) / 60000) : null;
  extras.push({ name, lastRunAt: at, ageMin, stale: ageMin == null || ageMin > allowanceMin });
}
const report = {
  at: new Date(now).toISOString(),
  host: process.env.COMPUTERNAME ?? "pc",
  staleJobs: jobs.filter((j) => j.stale).map((j) => j.path),
  staleExtras: extras.filter((e) => e.stale).map((e) => e.name),
  ok: jobs.every((j) => !j.stale) && extras.every((e) => !e.stale),
  jobs,
  extras,
  logsTrimmed: PRINT_ONLY ? 0 : trimLogs(),
};
console.log(JSON.stringify({ at: report.at, ok: report.ok, staleJobs: report.staleJobs, staleExtras: report.staleExtras, jobs: jobs.map((j) => `${j.path} ${j.lastStatus}${j.skipped ? "(" + j.skipped + ")" : ""} ${j.ageMin ?? "-"}m${j.stale ? " STALE" : ""}`) }, null, 1));
if (PRINT_ONLY) process.exit(0);
try {
  writeFileSync(join(DIR, "health.json"), JSON.stringify(report, null, 1));
} catch {
  /* best effort */
}
// A Windows toast when something is stale (once per hour at most: this runs
// hourly). Plain WinRT, no module to install. Owner asked to hear about a
// stuck job rather than discover it.
if (!report.ok || process.argv.includes("--test-toast")) {
  try {
    const { spawnSync } = await import("node:child_process");
    const what = process.argv.includes("--test-toast") ? "test notification" : [...report.staleJobs, ...report.staleExtras].slice(0, 4).join(", ");
    const ps = [
      "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
      "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
      "$n = $t.GetElementsByTagName('text'); $n.Item(0).AppendChild($t.CreateTextNode('Pokemon Deal Finder: jobs need attention')) | Out-Null",
      `$n.Item(1).AppendChild($t.CreateTextNode('Stale: ${what.replace(/'/g, "")}')) | Out-Null`,
      "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pokemon Deal Finder').Show([Windows.UI.Notifications.ToastNotification]::new($t))",
    ].join("; ");
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore", windowsHide: true, timeout: 20000 });
  } catch {
    /* the file and the heartbeat still carry it */
  }
}
try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    await db.from("catalog_snapshot").upsert({ kind: "pc_health", data: report, updated_at: report.at }, { onConflict: "kind" });
  }
} catch {
  /* the file report still exists */
}
