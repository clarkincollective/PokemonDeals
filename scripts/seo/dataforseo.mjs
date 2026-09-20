// DataForSEO client for SCRIPTS ONLY (2026-09-20). Never imported by a
// page, route or component: every call costs money and the site renders
// nothing from a paid provider (project rule).
//
// Credentials: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD from .env.local
// (HTTP Basic). Nothing here prints them. Every response's `cost` is
// accumulated; `post()` refuses to send once the run's budget is spent, so
// a script can state exactly what it spent and can never overrun.
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";

if (existsSync(".env.local")) loadDotenv({ path: ".env.local", quiet: true });

export const BASE = "https://api.dataforseo.com/v3";
export const LOCATIONS = Object.freeze({ US: 2840, UK: 2826, AU: 2036 });

export class BudgetExceeded extends Error {}

export function credentials(env = process.env) {
  const login = env.DATAFORSEO_LOGIN, password = env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD missing (see .env.local)");
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

// A run-scoped ledger: budget in USD, spent so far, one line per call.
export function ledger(budgetUsd) {
  return { budgetUsd: Number(budgetUsd), spentUsd: 0, calls: [] };
}

export async function post(path, tasks, { ledger: led, fetchImpl = fetch } = {}) {
  if (led && led.spentUsd >= led.budgetUsd) throw new BudgetExceeded(`budget ${led.budgetUsd} USD already spent (${led.spentUsd.toFixed(4)})`);
  const res = await fetchImpl(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: credentials(), "Content-Type": "application/json" },
    body: JSON.stringify(tasks),
  });
  const json = await res.json().catch(() => ({}));
  const cost = Number(json?.cost ?? 0);
  if (led) {
    led.spentUsd += Number.isFinite(cost) ? cost : 0;
    led.calls.push({ path, cost, status: json?.status_code, tasks: (json?.tasks ?? []).map((t) => t?.status_code) });
  }
  if (!res.ok || json?.status_code !== 20000) throw new Error(`${path}: HTTP ${res.status} / ${json?.status_code} ${json?.status_message ?? ""}`);
  return json;
}

// Free: balance and limits. Used to report what a run left behind.
export async function balance() {
  const res = await fetch(`${BASE}/appendix/user_data`, { headers: { Authorization: credentials() } });
  const json = await res.json();
  return json?.tasks?.[0]?.result?.[0]?.money ?? null;
}

// First result object of the first task, or null (tasks can carry an
// error status per task even when the envelope is 20000).
export function firstResult(json) {
  const t = json?.tasks?.[0];
  if (!t || t.status_code !== 20000) return { error: t?.status_message ?? "no task", result: null };
  return { error: null, result: t.result?.[0] ?? null };
}
