import type { Metadata } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import "./globals.css";

import { StreakSync } from "@/components/auth/StreakSync";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Makes every relative `alternates.canonical` and OG image resolve against
  // the real origin. Set NEXT_PUBLIC_SITE_URL before launch or this is
  // localhost and canonicals will be wrong.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Daily Dex — a daily guessing game for niche obsessions",
    // Pages set a bare title; the suffix is added once, here.
    template: "%s · Daily Dex",
  },
  description:
    "One puzzle a day, per obsession. Six guesses, a clue after every miss, and a streak worth protecting.",
  applicationName: "Daily Dex",
  openGraph: {
    siteName: "Daily Dex",
    type: "website",
    locale: "en_GB",
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the session here makes every route dynamic. That is inherent to
  // showing who is signed in; `getViewer` is request-cached so the header and
  // the page below share one lookup.
  const viewer = await getViewer();

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-parchment text-ink">
        <SiteHeader />
        {children}
        {viewer && <StreakSync username={viewer.username} />}
      </body>
    </html>
  );
}
