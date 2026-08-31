"use client";

import { useState } from "react";
import Image from "next/image";
import CardImagePlaceholder from "@/components/CardImagePlaceholder";
import { catalogImageUrl, upgradeCatalogImage } from "@/lib/cardImage";

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
        className={className}
        onError={() =>
          setStage((s) => (s === "listing" && reference ? "reference" : "placeholder"))
        }
      />
      {stage === "reference" && (
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 rounded bg-zinc-900/75 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Reference image
        </span>
      )}
    </>
  );
}
