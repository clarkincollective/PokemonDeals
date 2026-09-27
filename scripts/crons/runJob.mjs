#!/usr/bin/env node
// Runs ONE scheduled job - a real app/api route handler - on this machine.
//
//   node --import ./scripts/crons/register.mjs scripts/crons/runJob.mjs "/api/refresh-deals?mode=sweep&country=EBAY_US&pages=5"
//
// The handler is imported from app/api/<route>/route.js through the hooks in
// scripts/crons/hooks.mjs ("@/" -> repo, next/cache -> the shim that collects
// cache expiries for the site). It is invoked exactly as Vercel's scheduler
// invokes it: GET <site><path>, Authorization: Bearer CRON_SECRET. Same
// code, same database, same providers, same budgets - only the CPU is here.
//
// Environment: .env.local (this machine's secrets), then crons.json `pcEnv`
// (the non-secret production flags the jobs read - budget mode, pilot - so
// behaviour matches Vercel's), then, if present, .local/production.env (a
// `vercel env pull` of the project, which wins). Timeout: the route's own
// maxDuration (default 300 s) + 60 s grace, then exit 124.
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadDotenv } from "dotenv";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
process.chdir(REPO);

const spec = process.argv[2];
if (!spec || !spec.startsWith("/api/")) {
  console.error("usage: runJob.mjs </api/route?query>");
  process.exit(2);
}

// --- environment --------------------------------------------------------
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
const cronsCfg = JSON.parse(readFileSync(join(REPO, "crons.json"), "utf8"));
for (const [k, v] of Object.entries(cronsCfg.pcEnv ?? {})) if (process.env[k] == null) process.env[k] = String(v);
if (existsSync(".local/production.env")) loadDotenv({ path: ".local/production.env", override: true, quiet: true });
if (!process.env.CRON_SECRET) {
  console.error("CRON_SECRET missing");
  process.exit(2);
}
const SITE = process.env.SITE_ORIGIN || "https://pokemondealfinder.com";

// --- the route --------------------------------------------------------
const url = new URL(spec, SITE);
const routeDir = join(REPO, "app", ...url.pathname.split("/").filter(Boolean));
const routeFile = join(routeDir, "route.js");
if (!existsSync(routeFile)) {
  console.error(`no route at ${routeFile}`);
  process.exit(2);
}
const routeSrc = readFileSync(routeFile, "utf8");
const maxDuration = Number(/export const maxDuration = (\d+)/.exec(routeSrc)?.[1] ?? 300);

// --- lock (one run per job path at a time) -----------------------------
const slug = spec.replace(/^\/api\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 120);
mkdirSync(".local/cron", { recursive: true });
const lock = join(".local/cron", `${slug}.lock`);
try {
  const age = Date.now() - statSync(lock).mtimeMs;
  if (age < (maxDuration + 120) * 1000) {
    console.log(JSON.stringify({ job: spec, skipped: "already_running", lockAgeS: Math.round(age / 1000) }));
    process.exit(0);
  }
} catch {
  /* no lock */
}
writeFileSync(lock, `${process.pid} ${new Date().toISOString()}\n`);
const releaseLock = () => {
  try {
    unlinkSync(lock);
  } catch {
    /* gone */
  }
};
process.on("exit", releaseLock);

// --- timeout ------------------------------------------------------------
const started = Date.now();
const timer = setTimeout(() => {
  console.log(JSON.stringify({ job: spec, status: "timeout", afterS: maxDuration + 60 }));
  process.exit(124);
}, (maxDuration + 60) * 1000);
timer.unref();

// --- run ------------------------------------------------------------------
const mod = await import(pathToFileURL(routeFile).href);
const handler = mod.GET ?? mod.POST;
if (typeof handler !== "function") {
  console.error(`route exports no GET/POST: ${routeFile}`);
  process.exit(2);
}
const request = new Request(url.toString(), {
  method: mod.GET ? "GET" : "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "user-agent": "pc-cron/1.0", accept: "application/json" },
});

let status = 0;
let body = null;
let error = null;
try {
  const res = await handler(request);
  status = res?.status ?? 0;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
} catch (e) {
  error = e?.message ?? String(e);
}

// --- cache expiries the job asked for ---------------------------------
const shim = await import(pathToFileURL(join(HERE, "nextCacheShim.mjs")).href);
const pending = shim.pendingRevalidations();
const flushed = await shim.flushRevalidations({ site: SITE });

const summary = {
  job: spec,
  status: error ? "error" : status >= 200 && status < 300 ? "ok" : "http_error",
  http: status,
  error,
  tookMs: Date.now() - started,
  revalidated: { tags: pending.tags.length, paths: pending.paths.length, ...flushed },
  response: body && typeof body === "object" ? Object.fromEntries(Object.entries(body).filter(([k]) => !/detail|rows|items|perSpec/.test(k)).slice(0, 24)) : body,
};
const line = JSON.stringify(summary);
console.log(line);
try {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(join(".local/cron", `${slug}.log`), `${new Date().toISOString()} ${line}\n`);
} catch {
  /* stdout still has it */
}
process.exit(error || status >= 400 ? 1 : 0);
