// Wrapper for the inline-SVG diagrams in the guide pages. Gives them a
// consistent card frame, a real <figure>/<figcaption>, and a text
// takeaway that stands in for the diagram with CSS/SVG off or for a
// screen reader.
export default function GuideFigure({ children, caption }) {
  return (
    <figure className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="overflow-x-auto p-5 text-zinc-700 dark:text-zinc-300">{children}</div>
      {caption && (
        <figcaption className="border-t border-zinc-100 px-5 py-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
