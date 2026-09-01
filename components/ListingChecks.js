import Link from "next/link";
import { LISTING_CHECKS } from "@/lib/trustContent";

// Compact, SYSTEM-LEVEL trust block for /cards/[slug] and /deals/[id].
//
// It describes what the site does to every listing - it must NOT be read
// as a claim that this exact listing passed a specific check. There is no
// per-item status here on purpose: some visual "MATCH" results are a
// first-pass image comparison rather than a full structural review, so a
// per-deal "authenticity verified" badge would overstate. If a listing's
// stored record ever needs to surface its own verified outcome, that is a
// separate, evidence-gated change - not this block.
//
// No JSON-LD. One contextual link to /methodology.
export default function ListingChecks({ className = "" }) {
  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-card dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
      aria-label="How Pokemon Deal Finder checks listings"
    >
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        How we check listings
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        These checks apply to every listing on the site. They are automated and not perfect — always
        open the eBay listing and check its photos and description before buying.
      </p>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {LISTING_CHECKS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs">
        <Link
          href="/methodology"
          className="font-medium text-red-600 hover:underline dark:text-red-500"
        >
          Learn how we verify listings →
        </Link>
      </p>
    </section>
  );
}
