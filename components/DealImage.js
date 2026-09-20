"use client";

import { useState } from "react";
import Image from "next/image";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { catalogImageUrl, upgradeCatalogImage } from "@/lib/cardImage";
import { ebayImageAt, ebaySrcSet, isEbayImage, EBAY_FALLBACK_WIDTH } from "@/lib/ebayImageSizes";

// The image for a deal / listing, with a TRUTHFUL fallback chain:
//
//   1. the actual eBay listing photo (`src`) - what the buyer is
//      purchasing. Preferred whenever it exists and loads.
//   2. if `src` is missing, or the browser fails to load it (dead URL,
//      optimizer failure, host/path change), fall back ONCE to the
//      canonical TCGplayer catalogue image for this exact card
//      (`cardTcgplayerId`), shown WITH a small "Reference image" label so
//      it is never mistaken for the seller's own photo.
//   3. if there is no trusted catalogue image either, a clean placeholder.
//
// UI ONLY. This never mutates `deals.image_url` and never touches the
// visual-authenticity worker's input - the stored listing image stays the
// counterfeit-screening evidence regardless of what renders here.
//
// One-way state machine (listing -> reference -> placeholder), so a
// persistently-failing source can't retry-loop. The parent supplies the
// aspect-ratio box, so switching stages never shifts layout (no CLS).
export default function DealImage({
  src,
  cardTcgplayerId,
  alt = "",
  sizes,
  quality = 85,
  priority = false,
  className = "object-contain p-3 transition-transform duration-200 group-hover:scale-[1.03]",
}) {
  const listing = typeof src === "string" && /^https?:\/\//.test(src) ? upgradeCatalogImage(src) : null;
  const reference = cardTcgplayerId != null ? catalogImageUrl(cardTcgplayerId) : null;

  const [stage, setStage] = useState(listing ? "listing" : reference ? "reference" : "placeholder");
  const current = stage === "listing" ? listing : stage === "reference" ? reference : null;

  if (!current) return <CardImagePlaceholder />;

  // VERCEL-COST-1: eBay listing photos bypass Vercel Image Optimization.
  // They are unique per ephemeral listing (thousands, each live for days),
  // already web-optimized JPEGs served from eBay's own CDN, and had almost
  // no Vercel edge-cache reuse - so every one was paying for AVIF/WebP
  // transforms + cache writes it never recouped. The canonical TCGplayer
  // catalogue art (the `reference` stage) stays optimized: it is immutable
  // and high-reuse (~720 hubs share ~720 images forever).
  const isEbayPhoto = isEbayImage(current);

  // Lighthouse 2026-09-21: because eBay photos skip the optimizer, the
  // browser was fetching the stored 1600 px original for a card displayed
  // at 116 px - 8.75 MB of mobile page weight, 3.3 MB of it pure
  // oversizing. next/image renders an unoptimized image as a bare <img>
  // with no srcset, so the responsive set has to be built here. eBay's CDN
  // serves the same photo at each width for free (lib/ebayImageSizes).
  // The optimized branch below is untouched: the catalogue art still goes
  // through next/image exactly as before.
  if (isEbayPhoto) {
    const srcSet = ebaySrcSet(current);
    return (
      <img
        key={current}
        src={ebayImageAt(current, EBAY_FALLBACK_WIDTH) ?? current}
        srcSet={srcSet ?? undefined}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        // The parent is the aspect-ratio box; this fills it exactly as
        // next/image's `fill` does, so nothing about the layout - or CLS -
        // changes with this switch.
        className={`absolute inset-0 h-full w-full ${className}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding={priority ? "sync" : "async"}
        onError={() => setStage((s) => (s === "listing" && reference ? "reference" : "placeholder"))}
      />
    );
  }

  return (
    <>
      <Image
        key={current}
        src={current}
        alt={alt}
        fill
        sizes={sizes}
        quality={quality}
        priority={priority}
        // SEO audit 2026-09-20: an above-the-fold card is the page's LCP
        // candidate - say so to the browser explicitly, not only via
        // eager loading.
        fetchPriority={priority ? "high" : undefined}
        // Only the catalogue art reaches this branch now - every eBay photo
        // returned above - so there is nothing left here to opt out of
        // optimization, and `unoptimized` would be dead.
        className={className}
        onError={() =>
          setStage((s) => (s === "listing" && reference ? "reference" : "placeholder"))
        }
      />
      {stage === "reference" && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 rounded bg-zinc-900/75 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Reference image
        </span>
      )}
    </>
  );
}
