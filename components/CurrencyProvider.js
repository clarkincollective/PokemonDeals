"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Viewer's currency + region + FX rates, fetched once from /api/rates
// after hydration. Kept OUT of the server render so the pages that show
// prices stay statically cacheable (reading the geo header server-side
// was forcing every card / deal / set page to `Cache-Control: no-store`).
//
// Until the fetch resolves, `viewer`/`marketplace` are null and every
// <Price> renders the listing's own (native) currency - a real price, and
// what a crawler indexes. After it resolves, prices convert to the
// viewer's currency where they differ (text-only swap, no layout shift).
const CurrencyContext = createContext({ viewer: null, marketplace: null, rates: null });

export const useCurrency = () => useContext(CurrencyContext);

export default function CurrencyProvider({ children }) {
  const [value, setValue] = useState({ viewer: null, marketplace: null, rates: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.rates) {
          setValue({ viewer: d.viewer ?? null, marketplace: d.marketplace ?? null, rates: d.rates });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
