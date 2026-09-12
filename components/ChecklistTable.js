"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { capture } from "@/lib/analytics/client";
import { EVENTS } from "@/lib/analytics/events";
import { CHECKLIST_TABLE_CLASS_OWNED, ChecklistCells } from "@/components/ChecklistRow";
import { COMPLETION_SCOPE, DEVICE_SCOPE, progressCounts, progressLabel, visibleRows } from "@/lib/checklistProgress";
import {
  clearOwned,
  getServerSnapshot,
  readOwned,
  storageWorks,
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

  return (
    <div data-checklist-print>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 print:hidden dark:border-zinc-800 dark:bg-zinc-950" data-print-hide>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-black dark:text-zinc-50" data-checklist-progress>
              {progressLabel(counts)}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400" data-checklist-persist={persistFailed ? "failed" : "ok"}>
              {persistFailed ? "Progress isn't saved; it will be lost on reload." : DEVICE_SCOPE}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleView}
              aria-pressed={view === "missing"}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-200"
            >
              {view === "missing" ? "Show all entries" : "Show missing only"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-200"
            >
              Print checklist
            </button>
            <button
              ref={resetRef}
              type="button"
              onClick={() => setConfirming((v) => !v)}
              aria-expanded={confirming}
              aria-controls={panelId}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-red-300 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-200"
            >
              Reset progress
            </button>
          </div>
        </div>

        {confirming && (
          // Inline confirmation rather than window.confirm: keyboard
          // reachable, announced, and it cannot block the page. There is no
          // existing dialog primitive in the project to reuse.
          <div id={panelId} role="group" aria-label="Confirm reset" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-sm text-zinc-800 dark:text-zinc-100">
              {`Clear all ${counts.owned} marked ${counts.owned === 1 ? "entry" : "entries"} for ${setName}? This only affects this device and cannot be undone.`}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={onReset} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                Yes, clear progress
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  resetRef.current?.focus();
                }}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{COMPLETION_SCOPE}</p>
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className={CHECKLIST_TABLE_CLASS_OWNED}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th scope="col">Own</th>
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
                    <input
                      type="checkbox"
                      checked={isOwned}
                      onChange={(e) => onToggleRow(key, e.target.checked)}
                      aria-label={`Mark ${r.name}${r.number ? ` (${r.number})` : ""} as owned`}
                      className="h-4 w-4 cursor-pointer accent-red-600"
                    />
                  </td>
                  <ChecklistCells r={r} />
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
