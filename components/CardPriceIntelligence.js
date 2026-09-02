"use client";

import Link from "next/link";
import Price from "@/components/Price";
import { hasPrice } from "@/lib/money";

// SEO Phase 11C - Card Price Intelligence.
//
// A compact, evidence-only panel: current market value, real 7/30/90/365-day
// change (only where the canonical Phase 11B history actually supports the
// window), one deterministic market-direction status, and - when a genuine
// displayable listing exists - how it sits against the market reference.
//
// Hard rules:
//  * every % is computed from the USD-canonical merged series, so it is
//    currency-invariant; only absolute money goes through <Price>.
//  * a window that trendWindows() returned null for is NOT rendered - no
//    "0%", no "N/A", no neutral filler.
//  * no buy/sell/undervalued/"will rise" language. History, not advice.

const WINDOW_LABELS = { d7: "7-day", d30: "30-day", d90: "90-day", d365: "1-year" };

function fmtPct(pct) {
  if (!Number.isFinite(pct)) return null;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)}%`;
}

function ChangeChip({ label, trend }) {
  if (!trend || !Number.isFinite(trend.changePct)) return null;
  const pct = trend.changePct;
  const dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const cls =
    dir === "up"
      ? "text-emerald-700 dark:text-emerald-400"
      : dir === "down"
        ? "text-red-700 dark:text-red-400"
        : "text-zinc-600 dark:text-zinc-300";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "–";
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tnum ${cls}`}>
        <span aria-hidden="true">{arrow}</span> {fmtPct(pct)}
      </p>
    </div>
  );
}

const SIGNAL_STYLE = {
  rising: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300",
  falling: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300",
  stable: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-200",
  limited: "bg-zinc-50 text-zinc-500 ring-zinc-400/20 dark:bg-zinc-900 dark:text-zinc-400",
};

function signalSubtext(signal) {
  if (!signal || signal.status === "limited") {
    if (signal?.reason === "source-disagreement")
      return "Recent price readings for this card disagree — trend on hold.";
    if (signal?.reason === "endpoint-anomaly" || signal?.reason === "low-confidence")
      return "A recent price reading looks unusual — trend on hold until it's confirmed.";
    return "Not enough history yet for a 30-day trend.";
  }
  const p = fmtPct(signal.changePct);
  if (signal.status === "stable") return `Roughly flat over 30 days (${p}).`;
  return `${p} over the last 30 days.`;
}

function noWindowsMessage(signal) {
  return signal?.reason === "source-disagreement" || signal?.reason === "endpoint-anomaly" || signal?.reason === "low-confidence"
    ? "A recent price reading is being confirmed before we show a trend."
    : "More price history is being collected.";
}

export default function CardPriceIntelligence({
  marketValueUsd = null,
  trends = null,
  signal = null,
  coverage = null,
  cheapestListingUsd = null,
  offersCount = 0,
}) {
  const mv = hasPrice(marketValueUsd) ? Number(marketValueUsd) : null;
  const windows = trends
    ? ["d7", "d30", "d90", "d365"].filter((k) => trends[k] && Number.isFinite(trends[k].changePct))
    : [];
  const anyWindow = windows.length > 0;

  // Nothing to stand on at all.
  if (mv == null && !anyWindow) return null;

  // Price position: prefer the 90-day reference, else 30-day.
  const posTrend =
    trends && trends.d90 && Number.isFinite(trends.d90.changePct)
      ? { days: 90, t: trends.d90 }
      : trends && trends.d30 && Number.isFinite(trends.d30.changePct)
        ? { days: 30, t: trends.d30 }
        : null;
  const posPct = posTrend ? Math.round(Math.abs(posTrend.t.changePct) * 10) / 10 : null;
  const posDir = posTrend ? (posTrend.t.changePct >= 0 ? "above" : "below") : null;

  // Deal context - offers passed in are already isDisplayableDeal-gated,
  // so this is a real listing, not a plain browsable one. Only shown when
  // the listing genuinely sits below the reference.
  const listing = hasPrice(cheapestListingUsd) ? Number(cheapestListingUsd) : null;
  const belowPct =
    listing != null && mv != null && listing < mv ? Math.round((1 - listing / mv) * 100) : null;
  const showDealContext = belowPct != null && belowPct >= 1;
  const d90 = trends && trends.d90 && Number.isFinite(trends.d90.changePct) ? trends.d90 : null;

  return (
    <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-card dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Price intelligence</h2>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        {mv != null && (
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Current market value · raw, Near Mint</p>
            <p className="text-3xl font-bold text-black dark:text-zinc-50">
              <Price usd={mv} native={{ amount: mv, currency: "USD" }} approxPrefix="" />
            </p>
          </div>
        )}
        {signal && (
          <div className="text-right">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${
                SIGNAL_STYLE[signal.status] ?? SIGNAL_STYLE.limited
              }`}
            >
              {signal.label}
            </span>
            <p className="mt-1 max-w-[16rem] text-xs text-zinc-400">{signalSubtext(signal)}</p>
          </div>
        )}
      </div>

      {anyWindow ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {windows.map((k) => (
            <ChangeChip key={k} label={WINDOW_LABELS[k]} trend={trends[k]} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">{noWindowsMessage(signal)}</p>
      )}

      {posTrend && mv != null && (
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
          Current market value is <span className="font-semibold">{posPct}% {posDir}</span> its level around{" "}
          {posTrend.days} days ago.
        </p>
      )}

      {showDealContext && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          The cheapest active {offersCount === 1 ? "listing" : "listing"} (
          <Price usd={listing} native={{ amount: listing, currency: "USD" }} approxPrefix="" />) is{" "}
          <span className="font-semibold">{belowPct}% below</span> this market reference.
          {d90 && (
            <>
              {" "}
              Market reference is{" "}
              <span className="font-semibold">
                {d90.changePct >= 0 ? "up" : "down"} {Math.abs(Math.round(d90.changePct * 10) / 10)}%
              </span>{" "}
              over 90 days.
            </>
          )}
        </div>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
        {coverage?.label && <span>{coverage.label}</span>}
        <span>
          Price history &amp; direction only — not a prediction or investment advice.{" "}
          <Link href="/methodology" className="hover:text-red-600 hover:underline dark:hover:text-red-500">
            how we work this out
          </Link>
          .
        </span>
      </p>
    </section>
  );
}
