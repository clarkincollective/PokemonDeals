#!/usr/bin/env node
// Phase 13E.2 - THE REUSABLE BRAND-ASSET GENERATION COMMAND.
//
//   npm run social:assets                 refresh the plan + write the prompt pack
//   npm run social:assets -- generate     generate PLANNED assets via OpenAI images
//   npm run social:assets -- generate --sample     just the first-pass 10 (SS21)
//   npm run social:assets -- generate --family market_watch --limit 3
//   npm run social:assets -- status       counts + per-asset state
//   npm run social:assets -- qa <id> copyright_risk=PASS brand_fit=PASS ...
//   npm run social:assets -- approve <id> [<id> ...]
//   npm run social:assets -- reject  <id> [<id> ...]
//
// HARD RULES (docs/social-asset-library.md):
//   * This is the ONLY place an OpenAI image call may happen. `npm run
//     social:daily` never invokes it (SS18) and never imports this file.
//   * Every prompt is built by lib/social/assetPrompts.mjs from THREE
//     enum params only. No card / Pokemon / set / price / listing / user
//     data can reach a prompt - there is no code path that carries one.
//     `assertDataFree()` runs over every prompt immediately before the
//     API call.
//   * If OPENAI_API_KEY is not set, this prints that the architecture +
//     prompt pack are ready and STOPS cleanly (exit 0). It NEVER asks for
//     a key, never reads one from anywhere but the environment, never
//     logs or writes it.
//   * `generate` only ever sets status "generated". A human must review
//     and `approve` before an asset enters `social:daily` rotation.

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

import {
  ASSET_FAMILIES,
  VARIANT_PLAN,
  SAMPLE_SELECTION,
  PROMPT_SPEC_VERSION,
  buildAssetPrompt,
  assertDataFree,
  assetId,
} from "../lib/social/assetPrompts.mjs";
import { GENERATED_ASSET_DIR, MANIFEST_PATH, QA_CHECKS, validateAssetEntry } from "../lib/social/assets.mjs";
import {
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_REQUEST_SIZE,
  OPENAI_IMAGE_DOCS_URL,
} from "../lib/social/imageModelConfig.mjs";

const ROOT = process.cwd();
const PROMPT_OUT_DIR = path.join(ROOT, ".social-preview", "asset-prompts"); // gitignored - not committed to the public repo (SS13)
const OPENAI_IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";
// 13E.2.1 - model + size come from the single source of truth
// (lib/social/imageModelConfig.mjs, verified against ${OPENAI_IMAGE_DOCS_URL}).
// OPENAI_IMAGE_MODEL env var overrides for a pinned rollback only.
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || OPENAI_IMAGE_MODEL;
const RENDER_SIZE = OPENAI_IMAGE_REQUEST_SIZE;

const todayIso = () => new Date().toISOString().slice(0, 10);

// --- manifest helpers --------------------------------------------------

function emptyManifest() {
  return {
    _note: "Phase 13E.2 / 13E.2.1 generated-BACKGROUND manifest. See docs/social-asset-library.md + docs/social-card-artwork.md.",
    spec_version: PROMPT_SPEC_VERSION,
    generator: "scripts/socialAssets.mjs",
    image_model: IMAGE_MODEL,
    updated: todayIso(),
    boundary:
      "Image generation receives ZERO live eBay / PPT / card / price / listing / user data and NO real card image or URL. Prompts are evergreen, built only from lib/social/assetPrompts.mjs, and explicitly forbid drawing any card / creature / product shape (the hero zone stays empty). The real canonical card artwork (Version C) and the real site screenshot (Version D) are composited by the deterministic renderer AFTER generation - never by the model.",
    qa_checks: [...QA_CHECKS],
    status_values: ["planned", "generated", "approved", "rejected"],
    counts: { planned: 0, generated: 0, approved: 0, rejected: 0 },
    assets: [],
  };
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) return emptyManifest();
  try {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    if (!Array.isArray(m.assets)) return emptyManifest();
    return m;
  } catch {
    return emptyManifest();
  }
}

function recount(m) {
  const c = { planned: 0, generated: 0, approved: 0, rejected: 0 };
  for (const a of m.assets) c[a.status] = (c[a.status] ?? 0) + 1;
  m.counts = c;
  m.updated = todayIso();
  m.spec_version = PROMPT_SPEC_VERSION;
}

function saveManifest(m) {
  recount(m);
  mkdirSync(GENERATED_ASSET_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n", "utf8");
}

// Build the canonical set of planned entries from the prompt pack, and
// merge into the manifest without disturbing already-generated/approved
// rows.
function refreshPlan(m) {
  let added = 0;
  for (const family of ASSET_FAMILIES) {
    for (const v of VARIANT_PLAN[family]) {
      const id = assetId(family, v.variant);
      const built = buildAssetPrompt({ family, style: v.style, zone: v.zone });
      const existing = m.assets.find((a) => a.id === id);
      const base = {
        id,
        category: family,
        variant: v.variant,
        sample: SAMPLE_SELECTION.some(([f, vv]) => f === family && vv === v.variant),
        style: built.style,
        zone: built.zone,
        aspect_ratio: "4:5",
        render_size: built.render_size,
        composition: built.safe_zones.name,
        safe_zones: built.safe_zones,
        prompt_spec_version: built.spec_version,
      };
      if (!existing) {
        m.assets.push({ ...base, status: "planned", file: null, generated_date: null, approved_date: null, qa: null, notes: "" });
        added++;
      } else {
        // refresh evergreen spec fields, keep lifecycle fields
        Object.assign(existing, base);
      }
    }
  }
  m.assets.sort((a, b) => a.id.localeCompare(b.id));
  return added;
}

// Write the fully-expanded prompt for every planned variant to a
// gitignored folder for internal review (SS13: prompts are not exposed
// in the public repo).
function writePromptPack() {
  rmSync(PROMPT_OUT_DIR, { recursive: true, force: true });
  mkdirSync(PROMPT_OUT_DIR, { recursive: true });
  let n = 0;
  for (const family of ASSET_FAMILIES) {
    for (const v of VARIANT_PLAN[family]) {
      const built = buildAssetPrompt({ family, style: v.style, zone: v.zone });
      assertDataFree(built.prompt);
      const id = assetId(family, v.variant);
      writeFileSync(
        path.join(PROMPT_OUT_DIR, `${id}.txt`),
        `# ${id}\n# style=${built.style} zone=${built.zone} size=${built.render_size} spec=${built.spec_version}\n# safe zone: ${built.safe_zones.name} clear=${JSON.stringify(built.safe_zones.clear)}\n\n${built.prompt}\n`,
        "utf8"
      );
      n++;
    }
  }
  return n;
}

// --- OpenAI image call (the ONLY network call in the whole asset pipeline) ---

async function generateImageB64(prompt) {
  const key = process.env.OPENAI_API_KEY; // env ONLY - never a file, never a prompt, never logged
  if (!key) return { missingKey: true };
  assertDataFree(prompt); // belt & braces, right before the wire
  const res = await fetch(OPENAI_IMAGES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: RENDER_SIZE, n: 1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // never echo the request headers / key - only the API's own error text
    throw new Error(`OpenAI images API ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI images API returned no b64_json");
  return { b64 };
}

// --- subcommands ------------------------------------------------------

function cmdPlan() {
  const m = loadManifest();
  const added = refreshPlan(m);
  saveManifest(m);
  const n = writePromptPack();
  console.log("=== social:assets — plan ===\n");
  console.log(`Manifest:      ${MANIFEST_PATH}`);
  console.log(`Prompt pack:   ${PROMPT_OUT_DIR}  (${n} prompts, gitignored)`);
  console.log(`Plan:          ${m.assets.length} variants (${added} newly added)`);
  console.log(`Spec version:  ${PROMPT_SPEC_VERSION}\n`);
  printTable(m);
  console.log("\nNothing was generated. To generate (needs OPENAI_API_KEY):");
  console.log("  npm run social:assets -- generate --sample");
}

function printTable(m) {
  const byCat = {};
  for (const a of m.assets) (byCat[a.category] ??= []).push(a);
  for (const cat of ASSET_FAMILIES) {
    const rows = byCat[cat] ?? [];
    console.log(`  ${cat}`);
    for (const a of rows) {
      console.log(`     ${a.variant}  ${a.status.padEnd(9)}  style=${(a.style ?? "-").padEnd(24)} zone=${a.zone ?? "-"}  ${a.sample ? "[sample]" : ""}`);
    }
  }
}

async function cmdGenerate(args) {
  const m = loadManifest();
  if (!m.assets.length) refreshPlan(m);

  const sampleOnly = args.includes("--sample");
  const famArg = argValue(args, "--family");
  const limit = Number(argValue(args, "--limit") ?? (sampleOnly ? 10 : 6));
  const includeRejected = args.includes("--force");

  let queue = m.assets.filter((a) => a.status === "planned" || (includeRejected && a.status === "rejected"));
  if (sampleOnly) queue = queue.filter((a) => a.sample);
  if (famArg) queue = queue.filter((a) => a.category === famArg);
  queue = queue.slice(0, Math.max(0, limit));

  console.log("=== social:assets — generate ===\n");
  if (!queue.length) {
    console.log("Nothing queued (no matching 'planned' assets). Run `npm run social:assets` first, or check `status`.");
    return;
  }

  // Probe the key BEFORE doing anything, so we stop cleanly (SS16/SS19/SS23).
  if (!process.env.OPENAI_API_KEY) {
    console.log("OPENAI API READY — KEY REQUIRED\n");
    console.log("OPENAI_API_KEY is not configured in this environment. Everything that");
    console.log("does not require generation is already in place:");
    console.log(`  - prompt pack:   lib/social/assetPrompts.mjs  (spec ${PROMPT_SPEC_VERSION}, no-fake-card rules)`);
    console.log(`  - model config:  lib/social/imageModelConfig.mjs  (model ${IMAGE_MODEL}, size ${RENDER_SIZE})`);
    console.log(`  - manifest:      ${MANIFEST_PATH}  (${m.assets.length} planned variants)`);
    console.log(`  - renderer:      Versions A / B / C (real canonical card) / D (brand ad) all wired`);
    console.log("\nTo generate the first-pass sample later, set OPENAI_API_KEY (server/local");
    console.log("env var only - never commit it, never paste it into chat) and re-run:");
    console.log("  npm run social:assets -- generate --sample\n");
    console.log("STOPPING - no image-generation API call was made.");
    return; // exit 0 - this is an expected state, not an error
  }

  mkdirSync(path.join(GENERATED_ASSET_DIR), { recursive: true });
  let ok = 0;
  for (const a of queue) {
    const built = buildAssetPrompt({ family: a.category, style: a.style, zone: a.zone });
    process.stdout.write(`  ${a.id} ... `);
    try {
      const r = await generateImageB64(built.prompt);
      if (r.missingKey) {
        console.log("skipped (no key)");
        continue;
      }
      const relFile = path.join(GENERATED_ASSET_DIR, a.category, `${a.id}.png`).replace(/\\/g, "/");
      mkdirSync(path.dirname(path.join(ROOT, relFile)), { recursive: true });
      writeFileSync(path.join(ROOT, relFile), Buffer.from(r.b64, "base64"));
      a.status = "generated";
      a.file = relFile;
      a.generated_date = todayIso();
      a.qa = Object.fromEntries(QA_CHECKS.map((c) => [c, "PENDING"]));
      ok++;
      console.log("generated");
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
  saveManifest(m);
  console.log(`\n${ok}/${queue.length} generated -> status "generated".`);
  console.log("Review each in the daily gallery or by eye, then:");
  console.log("  npm run social:assets -- qa <id> generated_background=PASS copyright_risk=PASS brand_fit=PASS text_legibility=PASS ai_artifact=PASS");
  console.log("  npm run social:assets -- approve <id>");
}

function cmdQa(args) {
  const [id, ...pairs] = args;
  const m = loadManifest();
  const a = m.assets.find((x) => x.id === id);
  if (!a) return fail(`no asset "${id}"`);
  a.qa ??= Object.fromEntries(QA_CHECKS.map((c) => [c, "PENDING"]));
  for (const p of pairs) {
    const [k, v] = p.split("=");
    if (!QA_CHECKS.includes(k)) return fail(`unknown QA check "${k}". Valid: ${QA_CHECKS.join(", ")}`);
    if (!["PASS", "REJECT", "PENDING"].includes(v)) return fail(`value for ${k} must be PASS|REJECT|PENDING`);
    a.qa[k] = v;
  }
  saveManifest(m);
  console.log(`${id} qa:`, a.qa);
}

function cmdApprove(ids) {
  const m = loadManifest();
  for (const id of ids) {
    const a = m.assets.find((x) => x.id === id);
    if (!a) { console.error(`  no asset "${id}"`); continue; }
    if (a.status !== "generated") { console.error(`  ${id}: status is "${a.status}", expected "generated"`); continue; }
    if (!a.qa || !QA_CHECKS.every((c) => a.qa[c] === "PASS")) {
      console.error(`  ${id}: cannot approve - all 5 QA checks must be PASS first (npm run social:assets -- qa ${id} ...). Current: ${JSON.stringify(a.qa)}`);
      continue;
    }
    if (!a.file || !existsSync(path.join(ROOT, a.file))) { console.error(`  ${id}: file missing (${a.file})`); continue; }
    const problems = validateAssetEntry({ ...a, status: "approved" });
    if (problems.length) { console.error(`  ${id}: invalid entry - ${problems.join("; ")}`); continue; }
    a.status = "approved";
    a.approved_date = todayIso();
    console.log(`  approved ${id}`);
  }
  saveManifest(m);
}

function cmdReject(ids) {
  const m = loadManifest();
  for (const id of ids) {
    const a = m.assets.find((x) => x.id === id);
    if (!a) { console.error(`  no asset "${id}"`); continue; }
    a.status = "rejected";
    a.approved_date = null;
    console.log(`  rejected ${id} (regenerate with: npm run social:assets -- generate --family ${a.category} --force)`);
  }
  saveManifest(m);
}

function cmdStatus() {
  const m = loadManifest();
  if (!m.assets.length) refreshPlan(m), saveManifest(m);
  console.log("=== social:assets — status ===\n");
  console.log(`spec ${m.spec_version}   updated ${m.updated}`);
  console.log(`counts: ${JSON.stringify(m.counts)}\n`);
  printTable(m);
}

// --- arg utils -------------------------------------------------------

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case "plan":
      return cmdPlan();
    case "generate":
      return cmdGenerate(rest);
    case "status":
      return cmdStatus();
    case "qa":
      return cmdQa(rest);
    case "approve":
      return rest.length ? cmdApprove(rest) : fail("usage: approve <id> [<id> ...]");
    case "reject":
      return rest.length ? cmdReject(rest) : fail("usage: reject <id> [<id> ...]");
    default:
      return fail(`unknown subcommand "${cmd}". Try: plan | generate | status | qa | approve | reject`);
  }
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e) => {
    console.error(`social:assets failed: ${e && e.message ? e.message : e}`);
    process.exitCode = 1;
  });
}

export { refreshPlan, writePromptPack, generateImageB64 };
