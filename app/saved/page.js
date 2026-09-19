import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SkipToContent from "@/components/SkipToContent";
import SiteFooter from "@/components/SiteFooter";
import SavedView from "@/components/SavedView";
import { emailEnabled } from "@/lib/email";

// /saved - device-local saved cards and searches (growth brief §6). The
// content is whatever THIS browser holds, so the page is noindex and is
// never in the sitemap; the shell is static and the list renders after
// hydration.
export const metadata = {
  title: "Saved cards and searches",
  description: "Cards and searches you saved on this device, with their current live offers.",
  robots: { index: false, follow: true },
};

export default function SavedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SkipToContent />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 scroll-mt-6 px-6 py-8">
        <Link href="/" className="block text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← All deals
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-black dark:text-zinc-50">Saved</h1>
        <div className="mt-4">
          <SavedView alertsEnabled={emailEnabled()} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
