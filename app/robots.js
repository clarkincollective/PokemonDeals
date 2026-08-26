export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // API routes are for the app itself, not content for search
        // results, and the cron endpoints shouldn't be crawled/hit at all.
        disallow: "/api/",
      },
    ],
    sitemap: "https://pokemondealfinder.com/sitemap.xml",
  };
}
