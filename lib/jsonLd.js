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
export function collectionPage({ name, description, url, dateModified }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    ...(description ? { description } : {}),
    url: abs(url),
    isPartOf: { "@type": "WebSite", name: "Pokémon Deal Finder", url: SITE_URL },
    ...(dateModified ? { dateModified: new Date(dateModified).toISOString() } : {}),
  };
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
