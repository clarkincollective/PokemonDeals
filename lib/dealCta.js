// THE PURCHASE CALL TO ACTION, shared by every surface that offers one.
//
// Lives in lib/ rather than in a component for the same reason the
// savings-tier ladder does: it is a decision about what we may SAY, not
// about rendering, and more than one surface needs it - the grid card
// (components/DealCard) and the deal page's purchase panel and mobile
// sticky bar (app/deals/[id]/page.js). Importing it component-to-
// component breaks the route harness, which stubs "@/components/*" with
// a default export only, so the page rendered with `ctaLabelFor` as
// undefined. That was a real render failure, not a test artefact.
//
// THE WORDING RULE. Transactional language only where the visitor can
// actually transact:
//
//   auction                 -> "View auction". A bid is not a purchase;
//                              the price can still rise.
//   BIN, supported saving   -> "Buy this deal". The one case where both
//                              halves are true: it is buyable now, and
//                              we have evidence it is a deal.
//   BIN, no supported saving-> "View listing". Never "deal" and never
//                              "buy this deal", which would sell a
//                              bargain we have not evidenced.
//
// `savingsSupported` must be the caller's already-computed shared gate
// (listingPresentation + offerShipping). This function decides wording,
// never whether a claim is allowed.

const CTA_CARD_CLASS =
  "flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-lg bg-red-600 px-4 text-center text-white transition-colors hover:bg-red-700 active:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600";

function ctaLabelFor({ isAuction, savingsSupported } = {}) {
  if (isAuction) return "View auction";
  return savingsSupported ? "Buy this deal" : "View listing";
}

module.exports = { CTA_CARD_CLASS, ctaLabelFor };
