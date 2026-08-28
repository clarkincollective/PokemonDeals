// Emits one or more JSON-LD blocks. Pass a single object or an array;
// each becomes its own <script type="application/ld+json">.
export default function JsonLd({ data }) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.filter(Boolean).map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
