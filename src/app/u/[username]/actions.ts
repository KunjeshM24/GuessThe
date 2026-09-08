"use server";

import { headers } from "next/headers";

import { getProfileActivity } from "@/lib/profile/profile.server";
import { ACTIVITY_PAGE_SIZE, toPublicActivity } from "@/lib/profile/types";
import type { ActivityEntry } from "@/lib/profile/types";
import { rateLimit } from "@/lib/rate-limit";

/** Generous for a human clicking "load more", tight enough to stop scraping. */
const PAGES_PER_MINUTE = 30;

/**
 * Next page of a public profile's activity.
 *
 * Read-only and public, like the page it serves, so there is no auth check —
 * but it is still an endpoint anyone can call in a loop, so it is rate limited
 * and the offset is bounded. The underlying function clamps the page size too.
 */
export async function loadMoreActivityAction(
  username: unknown,
  offset: unknown,
): Promise<ActivityEntry[]> {
  if (typeof username !== "string" || username.length === 0 || username.length > 20) {
    return [];
  }

  // Cap the offset rather than letting a caller page arbitrarily deep.
  const safeOffset =
    typeof offset === "number" && Number.isInteger(offset) && offset >= 0
      ? Math.min(offset, 5_000)
      : 0;

  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";

  if (!rateLimit(`activity:${ip}`, PAGES_PER_MINUTE, 60_000)) return [];

  const entries = await getProfileActivity(username, safeOffset, ACTIVITY_PAGE_SIZE);
  // Same boundary as the page: this response is serialised to the browser too.
  return entries.map(toPublicActivity);
}
