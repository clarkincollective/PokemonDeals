// Small builders for the JSON-LD blocks pages emit. Keeping the shapes in
// one place avoids the hand-rolled-per-page drift the audit found (four
// index pages had no structured data at all, card-hub breadcrumbs were
// flat). Pure functions - no data access.

const SITE_URL = "https://pokemondealfinder.com";

const abs = (path) => (path?.startsWith("http") ? path : `${SITE_URL}${path || ""}`);

// items: [{ name, href? }] - last item is the current page, href optional.
export function breadcrumbList(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.href ? { item: abs(it.href) } : {}),
    })),
  };
}

// A listing/index page (market-data, best-finds, japanese-cards, ...).
// isPartOf points at the single site-wide WebSite entity declared in
// app/layout.js (@id .../#website) rather than re-declaring a copy.
export function collectionPage({ name, description, url, dateModified }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    ...(description ? { description } : {}),
    url: abs(url),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(dateModified ? { dateModified: new Date(dateModified).toISOString() } : {}),
  };
}

// GEO audit 2026-09-19 - a first-party data page (market-data studies, the
// integrity report) as a schema.org Dataset, so an AI engine can attribute
// a quoted number to a named, dated, licensed source. `temporalCoverage`
// is "start/end" (ISO dates); `variableMeasured` names what the numbers
// are; `license` is the site's chosen reuse licence for the figures.
export function dataset({ name, description, url, dateModified, temporalCoverage, variableMeasured, license }) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name,
    description,
    url: abs(url),
    creator: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    isAccessibleForFree: true,
    ...(license ? { license } : {}),
    ...(temporalCoverage ? { temporalCoverage } : {}),
    ...(dateModified ? { dateModified: new Date(dateModified).toISOString() } : {}),
    ...(Array.isArray(variableMeasured) && variableMeasured.length ? { variableMeasured } : {}),
  };
}

// The reuse licence the site grants for its published figures (guides,
// market-data pages, integrity report). CC BY 4.0: quote with attribution.
export const FIGURES_LICENSE = "https://creativecommons.org/licenses/by/4.0/";

// A schema.org PropertyValue for Product.additionalProperty - the shape
// the deal and card pages use to make set, number, printing, condition and
// reference machine-readable. Omitted (null) when the value is absent, so
// callers can .filter(Boolean).
export function propertyValue(name, value, extra = {}) {
  if (value === null || value === undefined || value === "") return null;
  return { "@type": "PropertyValue", name, value: String(value), ...extra };
}

// entries: [{ name, url }] in display order.
export function itemList(entries) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      url: abs(e.url),
    })),
  };
}
