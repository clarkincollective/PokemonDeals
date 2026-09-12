"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A horizontally scrollable container that shows its swipe hint ONLY when
// the content genuinely outgrows the container - measured, never inferred
// from a breakpoint. A long value, a wide column or a larger browser font
// can overflow at any viewport width, and a narrow viewport can fit fine,
// so `sm:hidden` would be wrong in both directions.
//
// The hint is aria-hidden: it is visual guidance for pointer/touch users.
// Assistive technology navigates the table by its own semantics, and the
// region stays keyboard-scrollable via tabIndex.
export default function ScrollableTable({ children, className = "" }) {
  const ref = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px tolerance: sub-pixel layout rounding can report a hairline
    // difference on a table that visually fits.
    setOverflowing(el.scrollWidth - el.clientWidth > 1);
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return undefined;

    if (typeof ResizeObserver !== "undefined") {
      // Observe the container AND its content: the container can keep its
      // width while the table inside it reflows.
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
      return () => ro.disconnect();
    }

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <>
      <div ref={ref} tabIndex={0} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      {overflowing && (
        <p className="mt-1.5 text-xs text-zinc-500" aria-hidden="true">
          Swipe horizontally to see all columns.
        </p>
      )}
    </>
  );
}
