import { permanentRedirect } from "next/navigation";

// SEO Phase 3 - the price-checker experience lives at /search (the
// existing indexable tool route, the WebSite SearchAction target, and the
// homepage hero's form action). /price-checker is the memorable URL some
// people will type or link; it 308s to the single canonical owner so we
// never have two competing indexable landing pages for the same intent.
export const dynamic = "force-static";

export default function PriceCheckerRedirect() {
  permanentRedirect("/search");
}
