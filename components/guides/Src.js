import { T30_SOURCES } from "@/lib/thirtiethSources";

const SRC_LINK =
  "text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-500";

// Inline citation beside the claim it supports. With children it is a
// plain labelled link (for table cells); on its own it reads
// "(source: expansion page)", so two citations in a row never collapse
// into an unreadable "source source".
export function Src({ id, children }) {
  const s = T30_SOURCES[id];
  const link = (
    <a href={s.href} rel="noopener noreferrer" target="_blank" className={SRC_LINK}>
      {children ?? s.short}
    </a>
  );
  if (children) return link;
  return <span className="text-sm text-zinc-500 dark:text-zinc-400">(source: {link})</span>;
}

export function Srcs({ ids }) {
  return (
    <span className="text-sm text-zinc-500 dark:text-zinc-400">
      (sources:{" "}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 ? ", " : ""}
          <a href={T30_SOURCES[id].href} rel="noopener noreferrer" target="_blank" className={SRC_LINK}>
            {T30_SOURCES[id].short}
          </a>
        </span>
      ))}
      )
    </span>
  );
}

// The "Sources" block at the foot of an article.
export function SourceList({ ids, children }) {
  return (
    <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 id="sources" className="scroll-mt-6 text-xl font-bold text-black dark:text-zinc-50">
        Sources
      </h2>
      <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        {ids.map((id) => (
          <li key={id}>
            <a
              href={T30_SOURCES[id].href}
              rel="noopener noreferrer"
              target="_blank"
              className="text-red-600 hover:underline dark:text-red-500"
            >
              {T30_SOURCES[id].label}
            </a>
          </li>
        ))}
        {children}
      </ul>
    </section>
  );
}
