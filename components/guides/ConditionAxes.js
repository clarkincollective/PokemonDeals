// The four things a grader (and you) actually look at on a card, plus
// what commonly costs points on each. Shared by the grading-scale guide
// ("what separates a 7 from a 9") and the how-to-check guide ("what to
// inspect"). General description - the exact tolerances are each grading
// company's own and are not reproduced here.

const AXES = [
  {
    axis: "Centering",
    look: "How even the border is on the front (and back). Measured as a ratio, e.g. 60/40 means one border is 1.5x the opposite one.",
    hurts: "Borders that are visibly uneven left-to-right or top-to-bottom. Back centering also counts, usually less strictly.",
  },
  {
    axis: "Corners",
    look: "All four corners under angled light and slight magnification. A sharp corner comes to a clean point.",
    hurts: "Fraying, whitening, softness or a visible bend at the tip — even on one corner.",
  },
  {
    axis: "Edges",
    look: "The full perimeter, front and back, for the pale line that appears where the top layer chips.",
    hurts: "Whitening, nicks, roughness or a factory mis-cut along any edge.",
  },
  {
    axis: "Surface",
    look: "The card face tilted against a light: print quality, holo pattern, scratches, indentations, print lines and any residue.",
    hurts: "Scratches, scuffs, print dots or lines, dents, a light bend, cloudiness on holo, or a fingerprint that won't wipe.",
  },
  {
    axis: "Creases & bends",
    look: "Flex the card gently (or view it edge-on against light) — a crease breaks the fibres and usually shows as a line.",
    hurts: "Any crease is a hard ceiling on the grade, even a faint one visible only under light. A bend with no fibre break is less severe but still counts.",
  },
];

export default function ConditionAxes() {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <th scope="col" className="px-4 py-2.5 font-semibold">What to look at</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">How</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">What usually costs points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {AXES.map((a) => (
            <tr key={a.axis} className="align-top">
              <th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-black dark:text-zinc-50">
                {a.axis}
              </th>
              <td className="px-4 py-3 leading-relaxed text-zinc-600 dark:text-zinc-400">{a.look}</td>
              <td className="px-4 py-3 leading-relaxed text-zinc-600 dark:text-zinc-400">{a.hurts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
