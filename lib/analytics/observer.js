// Phase 13A - framework-free helpers for impression + dwell tracking, so
// the "fires exactly once" and "10s of *visible* time" logic can be unit
// tested without a DOM.

// A gate that lets a key through exactly once.
export function makeOnceGate() {
  const seen = new Set();
  return {
    take(key) {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    has: (key) => seen.has(key),
    get size() {
      return seen.size;
    },
  };
}

// Given an IntersectionObserver entry, decide whether it counts as an
// impression: intersecting AND at least `minRatio` visible. Returns the
// element's impression key (from data-attributes) or null.
export function impressionKeyFor(entry, { minRatio = 0.5 } = {}) {
  if (!entry || !entry.isIntersecting) return null;
  if (typeof entry.intersectionRatio === "number" && entry.intersectionRatio < minRatio) return null;
  const el = entry.target;
  if (!el || !el.getAttribute) return null;
  return (
    el.getAttribute("data-analytics-section") ||
    el.getAttribute("data-analytics-deal-impression") ||
    el.getAttribute("data-analytics-filter-bar") ||
    null
  );
}

// Scroll-depth bucketing (diagnostic only).
export function scrollDepthBucket(scrollY, viewportH, docH) {
  const denom = Math.max(1, docH - viewportH);
  const pct = Math.min(100, Math.max(0, Math.round(((scrollY + viewportH) / docH) * 100)));
  void denom;
  if (pct >= 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return 0;
}

// A dwell timer that only accrues time while the page is visible. Call
// start() on mount, setVisible(bool) from a visibilitychange handler, and
// it fires `onQualified` once after `thresholdMs` of accumulated visible
// time. stop() clears everything.
export function createDwellTimer({ thresholdMs = 10000, onQualified, now = () => Date.now() } = {}) {
  let accrued = 0;
  let lastTick = null;
  let fired = false;
  let timer = null;

  function schedule() {
    clear();
    if (fired) return;
    const remaining = Math.max(0, thresholdMs - accrued);
    timer = setTimeout(() => {
      accrue();
      if (!fired && accrued >= thresholdMs) {
        fired = true;
        try {
          onQualified && onQualified();
        } catch {
          /* ignore */
        }
      }
    }, remaining);
  }
  function accrue() {
    if (lastTick != null) {
      accrued += Math.max(0, now() - lastTick);
      lastTick = now();
    }
  }
  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    start() {
      lastTick = now();
      schedule();
    },
    setVisible(visible) {
      if (fired) return;
      if (visible) {
        lastTick = now();
        schedule();
      } else {
        accrue();
        lastTick = null;
        clear();
      }
    },
    stop() {
      clear();
      lastTick = null;
    },
    get fired() {
      return fired;
    },
    get accruedMs() {
      accrue();
      return accrued;
    },
  };
}
