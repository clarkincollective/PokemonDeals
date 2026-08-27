// A clean placeholder when a listing has no photo - a plain "No image"
// text label reading as the card's dominant visual element looks broken;
// this keeps the same layout footprint as a real photo without an ugly
// text-only state. Shared by DealCard and the deal detail page so both
// show the exact same placeholder.
export default function CardImagePlaceholder({ className = "h-16 w-12" }) {
  return (
    <div className="flex h-full items-center justify-center text-zinc-300 dark:text-zinc-700">
      <svg viewBox="0 0 48 64" fill="none" className={className}>
        <rect x="1" y="1" width="46" height="62" rx="4" stroke="currentColor" strokeWidth="2" />
        <rect x="8" y="10" width="32" height="24" rx="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="24" cy="46" r="7" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}
