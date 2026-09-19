// Crawl policy. Every public page is open to search engines AND to AI
// retrieval / training agents - stated per agent (GEO audit 2026-09-19)
// so the invitation is explicit and survives a future template change,
// instead of resting on the wildcard alone.
//
//   /api/   application plumbing and cron endpoints - never content
//   /saved  a per-device page (its content is whatever that browser holds;
//           the page itself is noindex)
const DISALLOW = ["/api/", "/saved"];

// Retrieval and training agents named by their vendors' documentation.
// Same access as "*" - listed so a policy reader (human or machine) sees
// the answer without inferring it.
export const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "cohere-ai",
  "meta-externalagent",
  "Bingbot",
];

export default function robots() {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: "https://pokemondealfinder.com/sitemap.xml",
  };
}
