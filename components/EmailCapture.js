"use client";

import { useEffect, useRef, useState } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { analyticsEnabled } from "@/lib/analytics/config";
import { readLandingAttribution } from "@/lib/analytics/session";

// Phase CRM-1 - inline email capture. NOT a popup / modal / exit-intent.
// One field (email) + a hidden honeypot. One CTA. Truthful consent copy.
// Rendered by a server page only when server-side email capture is enabled
// (app decides; see lib/email.emailEnabled). Posts to
// /api/newsletter/subscribe, which double-opt-ins (a confirmation email,
// then ACTIVE). Nothing here sends mail.
//
// Props:
//   placement   "homepage" | "deal_detail" | "expired_deal" | "deals_browse"
//   pageType    coarse page-type string for analytics (low cardinality)
//   heading / body / className optional overrides

const ANALYTICS_ACTIVE = analyticsEnabled();
const HONEYPOT_FIELD = "company_website";
const PRIMARY_CTA = "Get deal alerts";
const CONSENT_COPY =
  "Occasional emails about standout Pokemon card deals and market finds. Unsubscribe anytime.";

const PRESETS = {
  homepage: {
    heading: "Don't want to keep checking back?",
    body: "Get the standout Pokemon card deals and market finds in your inbox. Occasional — only when something's genuinely worth sending.",
  },
  deal_detail: {
    heading: "Get standout deals like this by email",
    body: "Occasional alerts when strong below-market Pokemon cards show up. No spam, unsubscribe anytime.",
  },
  expired_deal: {
    heading: "Missed this one?",
    body: "Get standout Pokemon deal alerts so the next one comes to you.",
  },
  deals_browse: {
    heading: "Get the best finds by email",
    body: "Occasional standout Pokemon card deals in your inbox.",
  },
};

export default function EmailCapture({ placement = "homepage", pageType, heading, body, className = "" }) {
  const preset = PRESETS[placement] || PRESETS.homepage;
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const [message, setMessage] = useState("");
  const rootRef = useRef(null);
  const viewedRef = useRef(false);
  const pt = pageType || placement;

  // one "viewed" event when the module actually scrolls into view
  useEffect(() => {
    if (!ANALYTICS_ACTIVE || viewedRef.current) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver !== "function") {
      viewedRef.current = true;
      capture(EVENTS.EMAIL_CAPTURE_VIEWED, { placement, page_type: pt });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !viewedRef.current) {
            viewedRef.current = true;
            capture(EVENTS.EMAIL_CAPTURE_VIEWED, { placement, page_type: pt });
            io.disconnect();
          }
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [placement, pt]);

  async function submit(e) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setMessage("");
    capture(EVENTS.EMAIL_SIGNUP_SUBMITTED, { placement, page_type: pt });

    let attribution = {};
    try {
      attribution = readLandingAttribution();
    } catch {
      attribution = {};
    }

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          [HONEYPOT_FIELD]: hp,
          placement,
          route: typeof window !== "undefined" ? window.location.pathname : placement,
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          utm_content: attribution.utm_content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus("done");
        setMessage(
          data.double_opt_in === false
            ? "You're in — we'll send standout finds when they're worth sharing."
            : "Almost there — check your inbox to confirm."
        );
        capture(EVENTS.EMAIL_SIGNUP_SUCCESS, { placement, page_type: pt });
      } else {
        setStatus("error");
        setMessage(
          data.reason === "invalid_email"
            ? "That email doesn't look right."
            : data.reason === "rate_limited"
            ? "One moment — try again in a minute."
            : "Something went wrong — try again."
        );
        capture(EVENTS.EMAIL_SIGNUP_ERROR, { placement, page_type: pt, reason: String(data.reason || "unknown") });
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong — try again.");
      capture(EVENTS.EMAIL_SIGNUP_ERROR, { placement, page_type: pt, reason: "network" });
    }
  }

  const compact = placement !== "homepage";

  return (
    <section
      ref={rootRef}
      data-email-capture={placement}
      aria-label="Email deal alerts sign-up"
      className={
        (compact
          ? "rounded-xl border border-zinc-800 bg-zinc-950 px-5 py-5 text-zinc-100"
          : "border-y border-zinc-200 bg-zinc-950 dark:border-zinc-800") + " " + className
      }
    >
      <div className={compact ? "" : "mx-auto max-w-3xl px-6 py-10"}>
        <h2 className={compact ? "text-base font-semibold text-white" : "text-xl font-bold tracking-tight text-white"}>
          {heading || preset.heading}
        </h2>
        <p className={"mt-1.5 text-zinc-400 " + (compact ? "text-[13px] leading-relaxed" : "text-sm leading-relaxed max-w-xl")}>
          {body || preset.body}
        </p>

        {status === "done" ? (
          <p className="mt-4 text-sm font-medium text-emerald-400" role="status">
            {message}
          </p>
        ) : (
          <form onSubmit={submit} className={"mt-4 flex flex-wrap items-center gap-2 " + (compact ? "" : "max-w-md")} noValidate>
            {/* honeypot: visually hidden, not display:none (some bots skip those) */}
            <div aria-hidden="true" className="absolute h-px w-px overflow-hidden opacity-0" style={{ left: "-9999px" }}>
              <label htmlFor={`cw-${placement}`}>Company website</label>
              <input
                id={`cw-${placement}`}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
              />
            </div>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              aria-label="Email address"
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : PRIMARY_CTA}
            </button>

            {status === "error" && (
              <p className="w-full text-xs text-red-400" role="alert">
                {message}
              </p>
            )}
            <p className="w-full text-[11px] leading-relaxed text-zinc-500">
              {CONSENT_COPY}{" "}
              <a href="/privacy" className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-300">
                Privacy
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
