#!/usr/bin/env node
// Builds and deploys the site FROM THIS PC (28 Sep 2026) so Vercel bills no
// build minutes: a prebuilt deployment (`vercel build` here, then
// `vercel deploy --prebuilt --prod`) skips Vercel's build step entirely.
//
//   node scripts/deploy/deployFromPc.mjs            # deploy if origin/main moved
//   node scripts/deploy/deployFromPc.mjs --force    # deploy the current origin/main regardless
//   node scripts/deploy/deployFromPc.mjs --dry      # report only
//
// Needs VERCEL_TOKEN (user environment variable on this PC, or .env.local).
// Works in its own clone, C:\Users\James\pdf-deploy (outside OneDrive, never
// the working copy), reset to origin/main on every run. Build inputs: the
// project's production env is pulled by `vercel pull` into that clone.
// Scheduled every 5 minutes by Task Scheduler (PokemonDealFinder-Deploy); a
// lock file stops overlapping runs. Once this is verified, vercel.json's
// ignoreCommand makes Vercel skip its own builds.
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync, appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";

const REPO = "C:\\Users\\James\\OneDrive\\Desktop\\pokemon-deals";
const CLONE = process.env.PDF_DEPLOY_CLONE || "C:\\Users\\James\\pdf-deploy";
const REMOTE = "https://github.com/clarkincollective/PokemonDeals.git";
const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const STATE_DIR = join(REPO, ".local", "deploy");
const LOCK = join(STATE_DIR, "deploy.lock");
const LAST = join(STATE_DIR, "last-deployed-sha");
const LOG = join(STATE_DIR, "deploy.log");

mkdirSync(STATE_DIR, { recursive: true });
if (existsSync(join(REPO, ".env.local"))) loadDotenv({ path: join(REPO, ".env.local"), quiet: true });
const TOKEN = process.env.VERCEL_TOKEN;
const log = (line) => {
  const s = `${new Date().toISOString()} ${line}`;
  console.log(s);
  try {
    appendFileSync(LOG, s + "\n");
  } catch {
    /* stdout has it */
  }
};
// The project identity, so the CLI needs no `vercel link` in the clone.
const VERCEL_ORG_ID = process.env.VERCEL_ORG_ID || "team_AI42Gwyydk0v01wVv9bVSeH3";
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_2TBMLoTBL0bn5TyDVPTvwBdLTofw";
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    cwd: CLONE,
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32",
    env: { ...process.env, VERCEL_ORG_ID, VERCEL_PROJECT_ID, CI: "1" },
    ...opts,
  });
  return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};

if (!TOKEN) {
  log("no VERCEL_TOKEN - nothing deployed (set it as a user environment variable)");
  process.exit(2);
}
try {
  if (Date.now() - statSync(LOCK).mtimeMs < 30 * 60_000) {
    log("another deploy is running - skipped");
    process.exit(0);
  }
} catch {
  /* no lock */
}
writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}\n`);
process.on("exit", () => {
  try {
    unlinkSync(LOCK);
  } catch {
    /* gone */
  }
});

// --- the clone ---------------------------------------------------------
if (!existsSync(join(CLONE, ".git"))) {
  log(`cloning into ${CLONE}`);
  const c = spawnSync("git", ["clone", "--quiet", REMOTE, CLONE], { encoding: "utf8", windowsHide: true, shell: true });
  if (c.status !== 0) {
    log(`clone failed: ${(c.stderr ?? "").slice(0, 300)}`);
    process.exit(1);
  }
}
let r = run("git", ["fetch", "--quiet", "origin", "main"]);
if (r.code !== 0) {
  log(`fetch failed: ${r.out.slice(0, 300)}`);
  process.exit(1);
}
const head = run("git", ["rev-parse", "origin/main"]).out.trim();
const last = existsSync(LAST) ? readFileSync(LAST, "utf8").trim() : "";
if (!FORCE && head === last) {
  log(`origin/main ${head.slice(0, 7)} already deployed - nothing to do`);
  process.exit(0);
}
if (DRY) {
  log(`would deploy ${head.slice(0, 7)} (last ${last.slice(0, 7) || "none"})`);
  process.exit(0);
}
r = run("git", ["reset", "--hard", "--quiet", head]);
if (r.code !== 0) {
  log(`reset failed: ${r.out.slice(0, 300)}`);
  process.exit(1);
}
run("git", ["clean", "-fdq", "-e", ".vercel"]);

// --- install, pull env, build, deploy ------------------------------------
// `vercel pull` cannot return the project's SENSITIVE variables (they are
// write-only on Vercel, and nearly every variable of this project is
// sensitive), so the build would run without NEXT_PUBLIC_SUPABASE_URL etc.
// The NEXT_PUBLIC_* values are inlined into the client bundle at build time
// and must be present; runtime secrets are attached by Vercel to the
// deployment itself. So after the pull, every key the pulled file lacks is
// filled from this machine's .env.local (the same values production uses).
function overlayEnv() {
  const pulled = join(CLONE, ".vercel", ".env.production.local");
  const local = join(REPO, ".env.local");
  if (!existsSync(local)) return { added: 0 };
  const parse = (text) => {
    const out = new Map();
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m) out.set(m[1], m[2]);
    }
    return out;
  };
  const have = existsSync(pulled) ? parse(readFileSync(pulled, "utf8")) : new Map();
  const mine = parse(readFileSync(local, "utf8"));
  const missing = [...mine].filter(([k, v]) => !have.has(k) || have.get(k) === "" || have.get(k) === '""').filter(([, v]) => v !== "");
  if (!missing.length) return { added: 0 };
  mkdirSync(join(CLONE, ".vercel"), { recursive: true });
  appendFileSync(pulled, `\n# filled from the owner's .env.local (sensitive keys cannot be pulled)\n${missing.map(([k, v]) => `${k}=${v}`).join("\n")}\n`);
  return { added: missing.length };
}

const VERCEL = ["--yes", "vercel@latest"]; // the newest builder, as Vercel's own builds use
const steps = [
  ["npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"]],
  ["npx", [...VERCEL, "pull", "--yes", "--environment=production", `--token=${TOKEN}`]],
  ["overlay-env", []],
  ["npx", [...VERCEL, "build", "--prod", "--yes", `--token=${TOKEN}`]],
  ["npx", [...VERCEL, "deploy", "--prebuilt", "--prod", "--yes", `--token=${TOKEN}`]],
];
const started = Date.now();
for (const [cmd, args] of steps) {
  if (cmd === "overlay-env") {
    log(`> env overlay: ${overlayEnv().added} key(s) filled from .env.local`);
    continue;
  }
  const label = `${cmd} ${args.filter((a) => !a.startsWith("--token")).join(" ")}`;
  log(`> ${label}`);
  r = run(cmd, args);
  if (r.code !== 0) {
    log(`FAILED (${r.code}) ${label}\n${r.out.slice(-2500)}`);
    process.exit(1);
  }
  if (args.includes("deploy")) log(r.out.trim().split("\n").filter((l) => /https:\/\/|Production|Aliased|Deployed/i.test(l)).slice(-3).join(" | "));
}
writeFileSync(LAST, head + "\n");
log(`deployed ${head.slice(0, 7)} in ${Math.round((Date.now() - started) / 1000)} s`);
