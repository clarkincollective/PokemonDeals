"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { CHECKLIST_TABLE_CLASS_OWNED, ChecklistCells } from "@/components/ChecklistRow";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { COMPLETION_SCOPE, DEVICE_SCOPE, progressCounts, progressLabel, visibleRows } from "@/lib/checklistProgress";
import {
  clearOwned,
  getServerSnapshot,
  readOwned,
  subscribeChecklist,
  toggleOwned,
} from "@/lib/checklistStorage";

// Phase 17C.11 - the interactive set checklist.
//
// A CLIENT component, which in the App Router is still SERVER-RENDERED to
// HTML: every row, and every permanent /cards/[slug] link, is in the SSR
// markup exactly as before. Hydration then attaches the owned checkboxes.
// Rows are rendered by React from the same `rows` prop the server built -
// no DOM is mutated imperatively, so a row and its checkbox can never
// drift apart through filtering, reload or reset.
//
// Owned state is keyed on r.key (tcgplayerId, else "name|number"), the
// identity lib/setChecklist already assigns. Filtering re-renders from
// that same keyed data, so identity survives every view change.
//
// Nothing is written to the URL: no personal-progress or filter-combination
// URL exists to be crawled or indexed.

// Compact card-art thumbnail: the card's own catalogue artwork (row.image,
// id-keyed - never matched by name), lazy-loaded inside a wrapper with
// explicit dimensions at the full 5:7 card aspect so nothing shifts as it
// loads. Decorative alongside the name, so alt="" - the row text already
// identifies the card, and the list stays fully usable if the image never
// arrives (placeholder outline, same footprint). Hidden in print.
function Thumb({ row }) {
  return (
    <span
      className="relative block h-[62px] w-11 shrink-0 overflow-hidden rounded-[4px] bg-zinc-100 sm:h-[73px] sm:w-[52px] dark:bg-zinc-800 print:hidden"
      data-checklist-thumb
    >
      {row.image ? (
        <Image src={row.image} alt="" fill sizes="(max-width: 640px) 44px, 52px" quality={80} className="object-contain" />
      ) : (
        <CardImagePlaceholder className="h-7 w-5" />
      )}
    </span>
  );
}

export default function ChecklistTable({ setName, rows, caption }) {
  const owned = useSyncExternalStore(
    subscribeChecklist,
    useCallback(() => readOwned(setName), [setName]),
    getServerSnapshot
  );
  const [view, setView] = useState("all");
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");
  const [persistFailed, setPersistFailed] = useState(false);
  const resetRef = useRef(null);
  const panelId = useId();

  const ownedKeys = new Set(owned.map(String));
  const counts = progressCounts(rows, ownedKeys);
  const shown = visibleRows(rows, ownedKeys, view);
  const pct = counts.total ? Math.round((counts.owned / counts.total) * 100) : 0;

  function onToggleRow(key, nextOwned) {
    const ok = toggleOwned(setName, key);
    if (!ok) setPersistFailed(true);
    capture(EVENTS.CHECKLIST_PROGRESS_CHANGED, {
      set: setName,
      action: nextOwned ? "marked_owned" : "marked_missing",
      persisted: ok,
    });
  }

  function onToggleView() {
    const next = view === "missing" ? "all" : "missing";
    setView(next);
    setStatus(next === "missing" ? `Showing ${counts.missing} missing of ${counts.total}.` : `Showing all ${counts.total} entries.`);
    capture(EVENTS.CHECKLIST_VIEW_CHANGED, { set: setName, view: next });
  }

  function onReset() {
    const ok = clearOwned(setName);
    if (!ok) setPersistFailed(true);
    setConfirming(false);
    setStatus("Progress cleared for this set on this device.");
    capture(EVENTS.CHECKLIST_PROGRESS_CHANGED, { set: setName, action: "reset", persisted: ok });
    resetRef.current?.focus();
  }

  const btn =
    "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-800 shadow-card transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div data-checklist-print>
      {/* Progress + controls. One card, restrained accent: the red is the
          progress fill, the checked boxes and the destructive confirm. */}
      <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-card sm:p-5 print:hidden dark:border-zinc-800 dark:bg-zinc-950" data-print-hide>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Your progress</p>
            <p className="tnum mt-1 text-base font-semibold text-black dark:text-zinc-50" data-checklist-progress>
              {progressLabel(counts)}
            </p>
            <div
              role="progressbar"
              aria-label={`${setName} checklist progress`}
              aria-valuemin={0}
              aria-valuemax={counts.total}
              aria-valuenow={counts.owned}
              aria-valuetext={`${counts.owned} of ${counts.total} entries marked owned`}
              className="mt-2.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
            >
              <div className="h-full rounded-full bg-red-600 transition-[width] duration-300 dark:bg-red-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400" data-checklist-persist={persistFailed ? "failed" : "ok"}>
              {persistFailed ? "Progress isn't saved; it will be lost on reload." : DEVICE_SCOPE}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={onToggleView} aria-pressed={view === "missing"} className={btn}>
              {view === "missing" ? "Show all entries" : "Show missing only"}
            </button>
            <button type="button" onClick={() => window.print()} className={btn}>
              Print checklist
            </button>
            <button
              ref={resetRef}
              type="button"
              onClick={() => setConfirming((v) => !v)}
              aria-expanded={confirming}
              aria-controls={panelId}
              className={btn}
            >
              Reset progress
            </button>
          </div>
        </div>

        {confirming && (
          // Inline confirmation rather than window.confirm: keyboard
          // reachable, announced, and it cannot block the page.
          <div id={panelId} role="group" aria-label="Confirm reset" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-sm text-zinc-800 dark:text-zinc-100">
              {`Clear all ${counts.owned} marked ${counts.owned === 1 ? "entry" : "entries"} for ${setName}? This only affects this device and cannot be undone.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={onReset} className="inline-flex min-h-11 items-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600">
                Yes, clear progress
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  resetRef.current?.focus();
                }}
                className={btn}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{COMPLETION_SCOPE}</p>
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
      </div>

      {/* Print-only scope line: a printed page must say what it contains,
          because "missing only" and "all entries" look identical on paper. */}
      <p className="hidden text-sm print:block" data-checklist-print-scope>
        {view === "missing"
          ? `${setName} checklist — MISSING ENTRIES ONLY (${counts.missing} of ${counts.total} entries; ${counts.owned} marked owned are not shown).`
          : `${setName} checklist — all ${counts.total} entries (${counts.owned} marked owned).`}
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-card dark:border-zinc-800 dark:bg-zinc-950">
        <table className={CHECKLIST_TABLE_CLASS_OWNED}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th scope="col">Own</th>
              <th scope="col">
                <span className="sr-only">Card art</span>
              </th>
              <th scope="col">No.</th>
              <th scope="col">Card</th>
              <th scope="col">Rarity</th>
              <th scope="col">Market reference</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const key = String(r.key);
              const isOwned = ownedKeys.has(key);
              return (
                <tr key={r.key} data-row-key={key} data-owned={isOwned ? "true" : "false"}>
                  <td>
                    {/* 44px label wraps the 20px box so the whole target is comfortable to tap */}
                    <label className="flex min-h-11 w-full cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={isOwned}
                        onChange={(e) => onToggleRow(key, e.target.checked)}
                        aria-label={`Mark ${r.name}${r.number ? ` (${r.number})` : ""} as owned`}
                        className="h-5 w-5 cursor-pointer rounded accent-red-600"
                      />
                    </label>
                  </td>
                  <td>
                    <Thumb row={r} />
                  </td>
                  <ChecklistCells r={r} compact />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {view === "missing" && counts.missing === 0 && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400" data-print-hide>
          Every entry in this checklist is marked owned on this device.
        </p>
      )}
    </div>
  );
}
