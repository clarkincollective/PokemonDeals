// Deterministic 1-10 grading-scale reference for the grading-scale guide.
// Descriptions are GENERAL hobby vocabulary (Gem Mint / Mint / Excellent
// / Good / Poor are common across graders) - not any one company's
// proprietary standard. Every row is hedged: the grading company makes
// the final call. No population figures, no per-company criteria.

const ROWS = [
  { g: "10", name: "Gem Mint", d: "Looks flawless to the naked eye. Sharp corners, clean edges, an unmarked surface, and centering that is close to perfect on both sides." },
  { g: "9", name: "Mint", d: "One very minor flaw on close inspection — a tiny edge speck, a hint of a soft corner, or slightly off centering." },
  { g: "8", name: "Near Mint / Mint", d: "A couple of small flaws: light edge wear, a slightly rounded corner, minor centering that is noticeable but not severe." },
  { g: "7", name: "Near Mint", d: "Light wear that is easy to see up close — minor whitening on edges or corners, a small surface scratch, or clearly off-centre." },
  { g: "6", name: "Excellent / Near Mint", d: "Moderate wear: visible corner and edge whitening, light scratching, or a small print/surface defect." },
  { g: "5", name: "Excellent", d: "Obvious handling wear — rounded corners, edge whitening around much of the card, scratches, but no creases." },
  { g: "4", name: "Very Good / Excellent", d: "Heavier wear, possibly a very light surface crease or bend, along with the corner/edge wear above." },
  { g: "3", name: "Very Good", d: "A well-handled card: creasing, heavy whitening, scuffing, maybe a light stain." },
  { g: "2", name: "Good", d: "Major wear — multiple creases, heavy scuffing or scratching, corner damage." },
  { g: "1", name: "Poor", d: "Severe damage: large creases, tears, missing material, heavy staining or writing." },
];

export default function GradeScaleTable() {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <th scope="col" className="px-4 py-2.5 font-semibold">Grade</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Common name</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Roughly what it communicates</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {ROWS.map((r) => (
            <tr key={r.g} className="align-top">
              <th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-black dark:text-zinc-50">
                {r.g}
              </th>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">
                {r.name}
              </td>
              <td className="px-4 py-3 leading-relaxed text-zinc-600 dark:text-zinc-400">{r.d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
