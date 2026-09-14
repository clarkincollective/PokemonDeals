#!/usr/bin/env node
// SOCIAL-LIVE-3 - run the social health check locally. The scheduled copy
// runs on Vercel (/api/social-health every 2 h) and emails the owner.
//   node scripts/socialHealth.mjs
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });
else loadDotenv({ quiet: true });

const { runSocialHealth } = await import("../lib/social/autopilot/ops.mjs");
const report = await runSocialHealth();
console.log(JSON.stringify(report, null, 2));
if (report.alerts.length) process.exit(1);
