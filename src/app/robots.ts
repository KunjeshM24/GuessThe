import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/env";

/**
 * robots.txt.
 *
 * Everything public is crawlable — the archive is the whole SEO strategy
 * (GamePlan.md Section 5.1). What is excluded is the set of routes that are
 * either per-user, single-use, or worthless in an index:
 *
 *   /settings        someone's own account page
 *   /auth/           one-time OAuth and email-confirmation callbacks
 *   /sign-in, /sign-up   no search value, and duplicated across every crawl
 *
 * Profiles at /u/<username> stay crawlable on purpose: they are public pages
 * and shared result cards link to them.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/settings", "/auth/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
