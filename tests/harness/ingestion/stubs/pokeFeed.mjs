// PokeDealFinder board stub: the scenario supplies the board items.
export async function fetchFeed() {
  return { listings: globalThis.__ingestHarness.feedItems ?? [], error: null };
}
