#!/usr/bin/env node
// STAGE-B CONTAINMENT (2026-09-11) - owner control of the DURABLE backlog
// circuit (lib/social/newsroom/backlogCircuit.mjs).
//
//   npm run social:backlog-circuit -- status            read-only
//   npm run social:backlog-circuit -- suspend [reason]   owner stop: /api/social-backlog-refill
//                                                        returns BACKLOG_SUSPENDED on every
//                                                        invocation until resumed. No deploy
//                                                        needed - the route reads the DB each run.
//   npm run social:backlog-circuit -- resume             owner resume (the ONLY way to clear a
//                                                        trip or a suspend)
//
// Writes go to social_qa_runs (qa_type BACKLOG_CIRCUIT) via the service
// role. Never touches Buffer, placements, or any env flag.

import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local", quiet: true });

const [cmd = "status", ...rest] = process.argv.slice(2);
const { backlogCircuitStatus, suspendBacklogCircuit, resumeBacklogCircuit } = await import("../lib/social/newsroom/backlogCircuit.mjs");

const print = (label, s) => {
  console.log(`${label}: ${s.suspended ? "SUSPENDED" : "CLOSED"} (state ${s.state}${s.reason ? `, reason: ${s.reason}` : ""}, failures 24h ${s.failures_24h}, durable ${s.durable})`);
};

if (cmd === "status") {
  print("backlog circuit", await backlogCircuitStatus());
} else if (cmd === "suspend") {
  const reason = rest.join(" ") || "owner_suspend";
  await suspendBacklogCircuit({ by: process.env.USER ?? process.env.USERNAME ?? "owner", reason });
  print("backlog circuit (after suspend)", await backlogCircuitStatus());
} else if (cmd === "resume") {
  await resumeBacklogCircuit({ by: process.env.USER ?? process.env.USERNAME ?? "owner" });
  print("backlog circuit (after resume)", await backlogCircuitStatus());
} else {
  console.error(`unknown command "${cmd}" - use status | suspend [reason] | resume`);
  process.exit(2);
}
