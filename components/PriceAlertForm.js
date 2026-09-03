"use client";

import { useState } from "react";

// "Email me when this drops" on a card hub. Posts to /api/alerts, which
// sends a confirmation link (double opt-in). Only rendered when email
// alerts are enabled (RESEND_API_KEY set) - the server decides that.
export default function PriceAlertForm({ cardSlug, cardName, suggestedPrice }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState("");
  const [digest, setDigest] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, cardSlug, cardName, targetPrice: target || null, newsletter: digest }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setStatus("sent");
        setMessage(
          body.status === "already_confirmed"
            ? "You already have an alert for this card."
            : "Check your inbox for a confirmation link."
        );
      } else {
        setStatus("error");
        setMessage(
          body.reason === "invalid_email"
            ? "That email doesn't look right."
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:text-red-500"
      >
        🔔 Email me if it drops
      </button>
    );
  }

  if (status === "sent") {
    return <p className="text-sm text-emerald-700 dark:text-emerald-500">{message}</p>;
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md flex-wrap items-center gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {/* Target is entered, stored and compared in USD (no FX at entry) -
          the "$ … USD" adornment makes the unit explicit rather than
          leaving a bare number. */}
      <div className="relative w-36">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={suggestedPrice ? Number(suggestedPrice).toFixed(0) : "target"}
          aria-label="Target price in US dollars"
          className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-6 pr-9 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">USD</span>
      </div>
      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-red-600 dark:hover:text-white"
      >
        {status === "sending" ? "…" : "Notify me"}
      </button>
      {status === "error" && <p className="w-full text-xs text-red-600">{message}</p>}
      <label className="flex w-full items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={digest}
          onChange={(e) => setDigest(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-zinc-300 text-red-600 focus:ring-red-500"
        />
        Also send me a weekly email of the site&apos;s best deals (optional)
      </label>
      <p className="w-full text-xs text-zinc-400">
        Target in USD (compared against each listing&apos;s total incl. shipping). One confirmation
        email, then only when it matches. No target = any below-market listing.
      </p>
    </form>
  );
}
