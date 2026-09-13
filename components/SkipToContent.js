// Native navigation works before hydration. The matching main landmark is
// programmatically focusable, but does not add a stop to ordinary tab order.
export default function SkipToContent({ target = "main-content" }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-zinc-900 focus:outline-2 focus:outline-offset-2 focus:outline-red-600"
    >
      Skip to content
    </a>
  );
}
