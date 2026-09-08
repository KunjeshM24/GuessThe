"use server";

import { headers } from "next/headers";

import { parseLocalStreaks } from "@/lib/engine/streak";
import { getViewer } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { mergeAnonymousStreaks } from "@/lib/streaks.server";

/** A device only needs to migrate once; anything more is noise or abuse. */
const MERGES_PER_HOUR = 10;

export type MergeResult =
  | { ok: true; merged: number }
  | { ok: false; error: string };

/**
 * Fold this device's anonymous streaks into the signed-in account
 * (GamePlan.md Section 5.2).
 *
 * Called by `<StreakSync />` after a sign-in. The payload comes straight from
 * localStorage, so it is validated for shape here and bounded against real
 * puzzle counts inside `mergeAnonymousStreaks` before anything is written.
 */
export async function mergeLocalStreaksAction(payload: unknown): Promise<MergeResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Not signed in." };

  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";

  // Keyed by user as well as IP: one abusive account cannot lock out everyone
  // else behind the same corporate NAT.
  if (!rateLimit(`streakmerge:${viewer.id}:${ip}`, MERGES_PER_HOUR, 3_600_000)) {
    return { ok: false, error: "Too many sync attempts." };
  }

  const local = parseLocalStreaks(payload);
  if (!local) return { ok: false, error: "Streak data was unreadable." };

  const { merged } = await mergeAnonymousStreaks(viewer.id, local);
  return { ok: true, merged };
}
