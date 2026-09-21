"use client";

import { useState } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { ALERT_MARKETPLACES, ALERT_CURRENCIES, ALERT_GRADERS } from "@/lib/alertMatch";

// "Email me when this drops" on a card hub (or, with kind="set", "email me
// when any card in this set is well below market" on a set page). Posts
// to /api/alerts, which sends a confirmation link (double opt-in). Only
// rendered when email alerts are enabled (RESEND_API_KEY set) - the server
// decides that.
//
// 2026-09-19 §6 - optional criteria behind "Narrow this alert": listing
// marketplace, condition / grade, the threshold's currency and whether it
// applies to the delivered total or the item price, an untargeted alert's
// own discount floor, and a digest preference (one email per check run
// instead of one per alert). Every value is a closed vocabulary shared
// with lib/alertMatch, which the cron uses to decide a match.
const MARKET_LABEL = { EBAY_US: "eBay US", EBAY_GB: "eBay UK", EBAY_AU: "eBay Australia", EBAY_CA: "eBay Canada", EBAY_DE: "eBay Germany", EBAY_IT: "eBay Italy" };
const CCY_SYMBOL = { USD: "$", GBP: "£", EUR: "€", AUD: "A$", CAD: "C$" };
const GRADES = ["10", "9.5", "9", "8.5", "8", "7"];

const selectClass = "min-h-11 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

export default function PriceAlertForm({ cardSlug, cardName, suggestedPrice, kind = "card", setSlug = null, setName = null }) {
  const isSet = kind === "set";
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [scope, setScope] = useState("all_in");
  const [marketplace, setMarketplace] = useState("");
  const [condition, setCondition] = useState("");
  const [grader, setGrader] = useState("");
  const [grade, setGrade] = useState("");
  const [minDiscount, setMinDiscount] = useState(isSet ? "20" : "10");
  const [digestPref, setDigestPref] = useState(false);
  const [digest, setDigest] = useState(false); // the separate weekly-newsletter consent
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  const subjectName = isSet ? setName : cardName;

  async function submit(e) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          cardSlug,
          cardName,
          alertKind: kind,
          setSlug,
          setName,
          targetPrice: isSet ? null : target || null,
          targetCurrency: currency,
          targetScope: scope,
          marketplace: marketplace || null,
          condition: condition || null,
          grader: condition === "graded" ? grader || null : null,
          grade: condition === "graded" ? grade || null : null,
          minDiscount: isSet || !target ? minDiscount : null,
          digest: digestPref,
          newsletter: digest,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setStatus("sent");
        setMessage(
          body.status === "already_confirmed"
            ? `You already have an alert for this ${isSet ? "set" : "card"}.`
            : "Check your inbox for a confirmation link."
        );
        // structural facts only - never the address, card or set
        capture(EVENTS.ALERT_CREATED, {
          alert_kind: kind,
          targeted: Boolean(target),
          currency,
          scope,
          has_marketplace: Boolean(marketplace),
          has_condition: Boolean(condition),
          digest: digestPref,
        });
      } else {
        setStatus("error");
        setMessage(
          body.reason === "invalid_email"
            ? "That email doesn't look right."
            : body.reason === "criteria_unavailable"
              ? "Marketplace, condition and currency options aren't available yet — remove them to set a standard alert."
              : "Couldn't set that up - try again in a bit."
        );
      }
    } catch {
      setStatus("error");
      setMessage("Couldn't set that up - try again in a bit.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-red-500"
      >
        🔔 {isSet ? "Email me about deals in this set" : "Email me if it drops"}
      </button>
    );
  }

  if (status === "sent") {
    return <p role="status" className="text-sm text-zinc-100">{message}</p>;
  }

  const sym = CCY_SYMBOL[currency] ?? "";
  return (
    <form aria-label={`Price alert for ${subjectName}`} aria-busy={status === "sending"} onSubmit={submit} className="flex w-full max-w-md flex-wrap items-center gap-2">
      <input
        type="email"
        aria-label="Email address"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="min-h-11 min-w-0 flex-1 basis-48 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-red-500 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {/* Target is entered and stored in the chosen currency (USD by
          default) with NO conversion at entry - the cron converts the
          listing into this currency when it checks. The adornments make
          the unit explicit rather than leaving a bare number. */}
      {!isSet && (
        <div className="relative w-36">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-600 dark:text-zinc-400">{sym}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={suggestedPrice && currency === "USD" ? Number(suggestedPrice).toFixed(0) : "target"}
            aria-label={currency === "USD" ? "Target price in US dollars" : `Target price in ${currency}`}
            className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white py-2 pl-7 pr-11 text-base outline-none focus:border-red-500 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-600 dark:text-zinc-400">{currency}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
      >
        {status === "sending" ? "Sending…" : "Notify me"}
      </button>
      {status === "error" && <p role="alert" className="w-full text-sm text-danger">{message}</p>}

      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        aria-expanded={more}
        className="min-h-11 w-full text-left text-xs font-semibold text-zinc-700 underline underline-offset-2 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-400"
      >
        {more ? "Hide options" : "Narrow this alert (marketplace, condition, currency, digest)"}
      </button>
      {more && (
        <div className="grid w-full grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <label className={labelClass}>
            Listing marketplace
            <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)} className={selectClass}>
              <option value="">Any marketplace</option>
              {ALERT_MARKETPLACES.map((m) => (
                <option key={m} value={m}>{MARKET_LABEL[m] ?? m}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Condition
            <select value={condition} onChange={(e) => setCondition(e.target.value)} className={selectClass}>
              <option value="">Any condition</option>
              <option value="NM">Near Mint (raw)</option>
              <option value="LP">Lightly Played (raw)</option>
              <option value="graded">Graded only</option>
            </select>
          </label>
          {condition === "graded" && (
            <>
              <label className={labelClass}>
                Grader
                <select value={grader} onChange={(e) => setGrader(e.target.value)} className={selectClass}>
                  <option value="">Any grader</option>
                  {ALERT_GRADERS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Grade
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className={selectClass}>
                  <option value="">Any grade</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {!isSet && (
            <>
              <label className={labelClass}>
                Target currency
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass}>
                  {ALERT_CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Target applies to
                <select value={scope} onChange={(e) => setScope(e.target.value)} className={selectClass}>
                  <option value="all_in">Total incl. shipping</option>
                  <option value="item">Item price only</option>
                </select>
              </label>
            </>
          )}
          {(isSet || !target) && (
            <label className={labelClass}>
              {isSet ? "Any card in the set at least" : "Or any listing at least"}
              <select value={minDiscount} onChange={(e) => setMinDiscount(e.target.value)} className={selectClass}>
                <option value="10">10% below market</option>
                <option value="20">20% below market</option>
                <option value="30">30% below market</option>
              </select>
            </label>
          )}
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={digestPref} onChange={(e) => setDigestPref(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-300 text-red-600 focus:ring-red-500" />
            Bundle my alerts: one email per check instead of one per alert
          </label>
          {scope === "all_in" && !isSet && (
            <p className="col-span-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              A total-price target only fires on listings whose shipping is recorded — a listing with unknown shipping never counts as under your total.
            </p>
          )}
        </div>
      )}

      <label className="flex min-h-11 w-full items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={digest}
          onChange={(e) => setDigest(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-zinc-300 text-red-600 focus:ring-red-500"
        />
        Also send me a weekly email of the site&apos;s best deals (optional)
      </label>
      <p className="w-full text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {isSet
          ? "One confirmation email, then only when a card in this set has a supported saving at or above your floor. Saving a card keeps it on this device; an alert emails you."
          : "Target in USD by default (compared against each listing's total incl. shipping). One confirmation email, then only when it matches. No target = any below-market listing. Saving a card keeps it on this device; an alert emails you."}
      </p>
    </form>
  );
}
