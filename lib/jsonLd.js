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
// `distribution` is a DataDownload: the actual file a machine can fetch.
// Only pass it where a real file exists - Google's Dataset guidance and
// plain honesty both require the advertised download to resolve. The
// integrity page has no file and correctly omits it.
export function dataDownload({ contentUrl, encodingFormat = "text/csv", name }) {
  if (!contentUrl) return null;
  return {
    "@type": "DataDownload",
    ...(name ? { name } : {}),
    encodingFormat,
    contentUrl: abs(contentUrl),
  };
}

export function dataset({ name, description, url, dateModified, temporalCoverage, variableMeasured, license, distribution }) {
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
    ...(distribution ? { distribution } : {}),
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

// 2026-09-20 - the one serializer for every <script type="application/ld+json">.
// A listing title, a card name or a guide string that contains "<" (or
// "</script" in the worst case) would otherwise end the script element
// early; JSON allows the \u003c escape, so the payload stays valid JSON
// and can never close the tag. Every emitter passes through here.
export function serializeJsonLd(data) {
  // U+2028 / U+2029 are written by code point: a raw line separator inside a
  // regex literal is a syntax error for some parsers (found 2026-09-20).
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  return JSON.stringify(data).split("<").join("\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");
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

// ---------------------------------------------------------------------------
// Site entities and the home-page graph (structured-data brief, 2026-09-20).
// One @graph on the home page; WebSite and Organization are emitted there
// only. Every builder is pure so the graph can be unit-tested for @id
// resolution, list positions and placeholders without rendering a page.
export const IDS = Object.freeze({
  organization: `${SITE_URL}/#organization`,
  website: `${SITE_URL}/#website`,
  logo: `${SITE_URL}/#logo`,
  primaryImage: `${SITE_URL}/#primaryimage`,
  webpage: `${SITE_URL}/#webpage`,
  featuredDeals: `${SITE_URL}/#featured-deals`,
  faq: `${SITE_URL}/#faq`,
  article: `${SITE_URL}/#how-it-compares`,
});
export const SITE_NAME = "Pokemon Deal Finder";
export const SITE_LANGUAGE = "en"; // matches <html lang> in app/layout.js
// First production commit (git log --reverse): 2026-08-26 - the launch proxy
// for foundingDate and the home page's datePublished.
export const SITE_FOUNDED = "2026-08-26";
export const SITE_DESCRIPTION_SHORT =
  "Independent comparisons of eBay Pokemon card listings against real market references. Purchases take place on eBay.";
export const dealUrl = (id) => `${SITE_URL}/deals/${id}`;

export function organizationNode({ sameAs = [] } = {}) {
  return {
    "@type": "Organization",
    "@id": IDS.organization,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description:
      "Pokemon Deal Finder is a free, independent tool that lists live eBay Pokemon card listings priced below a documented market reference for the exact card and condition, after exact-printing, condition, availability and image-authenticity checks. It holds no stock and runs no paid placement.",
    logo: { "@id": IDS.logo },
    image: { "@id": IDS.logo },
    email: "pokemondealfinder@gmail.com",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "general enquiries",
      email: "pokemondealfinder@gmail.com",
      url: `${SITE_URL}/contact`,
      availableLanguage: SITE_LANGUAGE,
    },
    sameAs,
    foundingDate: SITE_FOUNDED,
    areaServed: ["US", "GB", "AU", "CA", "DE", "IT"],
    knowsAbout: [
      "Pokemon Trading Card Game",
      "Pokemon card market prices",
      "eBay Pokemon card listings",
      "trading card condition and grading (PSA, CGC, BGS, SGC, ACE, TAG)",
    ],
    publishingPrinciples: `${SITE_URL}/methodology`,
    ownershipFundingInfo: `${SITE_URL}/affiliate-disclosure`,
  };
}

// THE PUBLISHER NODE FOR INNER PAGES (2026-09-21 audit).
//
// Six page families reference `#organization` as author / publisher /
// creator - /about, /contact, /how-it-works, /methodology, every guide
// (components/GuideLayout) and every Dataset page (/market-data/*,
// /integrity) - and NONE of them defined that node. A bare
// `{"@id": "...#organization"}` with no matching node in the document is
// an unresolved reference: the Organization is only ever defined on the
// home page, and a consumer reading a guide or the market-data study
// sees a publisher that points at nothing.
//
// That is precisely backwards for the pages whose value is attributable
// authority. This emits the same node the home page emits, from the same
// builder and the same verified sameAs list, so there is ONE coherent
// identity rather than a second, thinner one.
//
// `unresolvedReferences()` below is what proves a page is clean; the
// audit found it was only ever applied to the home graph.
export function publisherNode(sameAs = []) {
  return organizationNode({ sameAs });
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": IDS.website,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    alternateName: "pokemondealfinder.com",
    description: SITE_DESCRIPTION_SHORT,
    inLanguage: SITE_LANGUAGE,
    publisher: { "@id": IDS.organization },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

// app/icon.svg is served at /icon.svg by the Next file convention: a square
// 150x150 viewBox mark (SVG scales past the 112px floor), not robots-blocked.
export function logoImageNode() {
  return {
    "@type": "ImageObject",
    "@id": IDS.logo,
    url: `${SITE_URL}/icon.svg`,
    contentUrl: `${SITE_URL}/icon.svg`,
    caption: SITE_NAME,
    inLanguage: SITE_LANGUAGE,
  };
}

// The metadata route app/opengraph-image.js (1200x630 PNG) is what the page
// emits as og:image; the un-hashed route serves the same file.
export function primaryImageNode() {
  return {
    "@type": "ImageObject",
    "@id": IDS.primaryImage,
    url: `${SITE_URL}/opengraph-image`,
    contentUrl: `${SITE_URL}/opengraph-image`,
    width: 1200,
    height: 630,
    encodingFormat: "image/png",
    caption: SITE_NAME,
    inLanguage: SITE_LANGUAGE,
  };
}

// items: [{ question, answer }] - the same array the visible FAQ renders.
export function faqPageNode(items, { id = IDS.faq, url = `${SITE_URL}/#faq`, isPartOf = IDS.webpage } = {}) {
  return {
    "@type": "FAQPage",
    "@id": id,
    url,
    name: "FAQ",
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": isPartOf },
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

// One graph: per-node @context stripped, one @context on the wrapper.
export function graph(nodes) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean).map((node) => {
      const { "@context": _ctx, ...rest } = node;
      return rest;
    }),
  };
}

// The home page, from the same data that renders it:
//   title / description / h1 - the constants behind <title>, the meta
//     description and the H1
//   lastRefreshed - the scan timestamp behind the "As of" line (ISO)
//   deals - [{ id, name }] in render order (featured first, then the grid)
//   liveCount - the whole list's size (the "N live deals" figure)
//   faqItems - the visible FAQ array
//   article - { headline, description, dateModified, citation }
export function buildHomeGraph({
  title,
  description,
  h1,
  lastRefreshed = null,
  deals = [],
  liveCount = null,
  faqItems = [],
  sameAs = [],
  article = null,
}) {
  const hasDeals = deals.length > 0;
  const webpage = {
    "@type": "CollectionPage",
    "@id": IDS.webpage,
    url: `${SITE_URL}/`,
    name: title,
    headline: h1,
    description,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": IDS.website },
    publisher: { "@id": IDS.organization },
    about: {
      "@type": "Thing",
      name: "Pokemon Trading Card Game",
      sameAs: "https://en.wikipedia.org/wiki/Pok%C3%A9mon_Trading_Card_Game",
    },
    mentions: { "@type": "Organization", name: "eBay", sameAs: "https://en.wikipedia.org/wiki/EBay" },
    primaryImageOfPage: { "@id": IDS.primaryImage },
    image: { "@id": IDS.primaryImage },
    datePublished: SITE_FOUNDED,
    ...(lastRefreshed ? { dateModified: new Date(lastRefreshed).toISOString() } : {}),
    ...(hasDeals ? { mainEntity: { "@id": IDS.featuredDeals } } : {}),
  };
  const list = hasDeals
    ? {
        ...itemList(deals.map((d) => ({ name: d.name, url: `/deals/${d.id}` }))),
        "@id": IDS.featuredDeals,
        name: "Deals to explore",
        description:
          "Live eBay Pokemon card listings shown on the Pokemon Deal Finder home page, each linking to its own deal page.",
        url: `${SITE_URL}/#deals`,
        ...(liveCount != null ? { numberOfItems: liveCount } : {}),
      }
    : null;
  const articleNode = article
    ? {
        "@type": "Article",
        "@id": IDS.article,
        headline: article.headline,
        description: article.description,
        mainEntityOfPage: { "@id": IDS.webpage },
        url: IDS.article,
        author: { "@id": IDS.organization },
        publisher: { "@id": IDS.organization },
        dateModified: article.dateModified,
        inLanguage: SITE_LANGUAGE,
        about: [
          { "@type": "Thing", name: "Pokemon Trading Card Game" },
          { "@type": "Thing", name: "eBay" },
        ],
        ...(article.citation?.length ? { citation: article.citation } : {}),
      }
    : null;
  return graph([
    organizationNode({ sameAs }),
    websiteNode(),
    logoImageNode(),
    primaryImageNode(),
    webpage,
    list,
    faqItems.length ? faqPageNode(faqItems) : null,
    articleNode,
  ]);
}

// Test helper (pure): every {"@id"} reference inside `g` resolves to a node
// declared in the same graph. Returns the unresolved ids.
export function unresolvedReferences(g) {
  const declared = new Set((g["@graph"] ?? []).map((n) => n["@id"]).filter(Boolean));
  const missing = new Set();
  const walk = (v, isNode) => {
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, false));
      return;
    }
    if (!v || typeof v !== "object") return;
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === "@id" && !isNode) {
      if (!declared.has(v["@id"])) missing.add(v["@id"]);
      return;
    }
    for (const k of keys) if (k !== "@id") walk(v[k], false);
  };
  for (const n of g["@graph"] ?? []) walk(n, true);
  return [...missing];
}
