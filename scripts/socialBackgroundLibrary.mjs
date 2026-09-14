#!/usr/bin/env node
// SOCIAL-LIVE-3 - build the REUSABLE approved background library for the
// daily autopilot (cost control: generate a few once, reuse them forever).
//
//   node scripts/socialBackgroundLibrary.mjs --moods editorial,three_up,market_shape
//
// Each background: the existing data-free prompt (assertDataFree) ->
// OpenAI image -> the existing §8 safety scan -> content-addressed upload ->
// lib/social/autopilot/backgrounds.json. A safety refusal is recorded and
// never retried. Existing entries for a mood are kept (no regeneration).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const { buildBackgroundPrompt, generateBackground, scanBackground } = await import("../lib/newsroom/hybrid/aiBackground.mjs");
const { newBudget } = await import("../lib/newsroom/hybrid/budget.mjs");
const { getStorageProvider } = await import("../lib/social/storage/index.mjs");

const MANIFEST = "lib/social/autopilot/backgrounds.json";
const args = process.argv.slice(2);
const moods = (args[args.indexOf("--moods") + 1] ?? "editorial").split(",").map((s) => s.trim()).filter(Boolean);
const lib = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { version: 1, backgrounds: [] };
const storage = getStorageProvider();

for (const mood of moods) {
  if (lib.backgrounds.some((b) => b.mood === mood)) { console.log(`${mood}: already in library - kept`); continue; }
  const spec = buildBackgroundPrompt({ layout: mood, densityHint: "low", storyCategory: "EDUCATION" });
  const budget = newBudget();
  const gen = await generateBackground({ spec, budget });
  if (!gen.ok) { console.log(`${mood}: generation unavailable (${gen.availability}${gen.error ? ` ${gen.error.kind}: ${gen.error.message}` : ""})`); continue; }
  const scan = await scanBackground({ b64: gen.b64, budget });
  if (!scan.ok) { console.log(`${mood}: safety scan rejected (${scan.reason})`); continue; }
  const bytes = Buffer.from(gen.b64, "base64");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const up = await storage.upload({ storageKey: `by-hash/${sha}.png`, bytes, contentType: "image/png" });
  if (!up.ok) { console.log(`${mood}: upload failed (${up.reason})`); continue; }
  lib.backgrounds.push({ mood, sha256: sha, url: up.publicUrl, model: gen.model, prompt_sha: gen.prompt_sha, scan_notes: scan.notes ?? [], created_at: new Date().toISOString() });
  writeFileSync(MANIFEST, JSON.stringify(lib, null, 2) + "\n");
  console.log(`${mood}: added ${sha.slice(0, 12)} (${Math.round(bytes.length / 1024)} KB)`);
}
