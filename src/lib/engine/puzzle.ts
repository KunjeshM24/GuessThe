import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/server";
import { getPack } from "@/packs/registry";
import type { PackSlug } from "@/packs/registry";

import { todayUtc } from "./date.ts";
import type { Puzzle } from "./types.ts";

export type ResolvedPack = {
  id: string;
  slug: PackSlug;
  name: string;
  isLive: boolean;
};

/**
 * Server-only puzzle resolution.
 *
 * Uses the admin client because `puzzles` has no client-readable RLS policy by
 * design — answers must never be reachable with the anon key
 * (GamePlan.md Section 5.5, and the note in the init migration). Nothing this
 * module returns may be handed to a Client Component; run it through
 * `evaluate()` first and send the `PublicGameState`.
 *
 * There is deliberately no `date` parameter. Resolution is always "today in
 * UTC", so there is no code path a client could steer towards a future
 * puzzle. The archive (roadmap step 11) will add past-date reads separately,
 * with its own clamp.
 */
export async function getDailyPuzzle(
  packSlug: PackSlug,
): Promise<{ pack: ResolvedPack; puzzle: Puzzle | null } | null> {
  const supabase = createAdminClient();
  const date = todayUtc();

  const { data: pack } = await supabase
    .from("packs")
    .select("id, slug, name, is_live")
    .eq("slug", packSlug)
    .maybeSingle();

  if (!pack) return null;

  const resolvedPack: ResolvedPack = {
    id: pack.id,
    slug: pack.slug as PackSlug,
    name: pack.name,
    isLive: pack.is_live,
  };

  const { data: row } = await supabase
    .from("puzzles")
    .select("id, date, answer, aliases, close_terms, hints, fact, hero_image_url")
    .eq("pack_id", pack.id)
    .eq("date", date)
    .maybeSingle();

  if (!row) return { pack: resolvedPack, puzzle: null };

  // Puzzle number is its position in the pack's run, so the share card can say
  // "#12" without storing a counter that could drift from the dates.
  const { count } = await supabase
    .from("puzzles")
    .select("id", { count: "exact", head: true })
    .eq("pack_id", pack.id)
    .lte("date", date);

  return {
    pack: resolvedPack,
    puzzle: {
      id: row.id,
      packSlug,
      packNoun: getPack(packSlug).noun,
      date: row.date,
      number: count ?? 1,
      answer: row.answer,
      aliases: toStringArray(row.aliases),
      closeTerms: toStringArray(row.close_terms),
      hints: toStringArray(row.hints),
      fact: row.fact,
      heroImageUrl: row.hero_image_url,
    },
  };
}

/**
 * Slug -> id for every pack, memoised per request.
 *
 * Uses the admin client because the `packs` select policy only exposes rows
 * where `is_live`, and streaks still have to be recorded for a pack that is
 * being previewed before launch. A pack id is not secret — the answers on the
 * other side of it are, and those are not touched here.
 */
export const getPackIds = cache(async (): Promise<Map<string, string>> => {
  const { data } = await createAdminClient().from("packs").select("id, slug");
  return new Map((data ?? []).map((row) => [row.slug as string, row.id as string]));
});

/**
 * How many puzzles the pack has actually published up to today.
 *
 * This is the hard ceiling on any streak in that pack — you cannot have played
 * on more days than there were days to play. Used to bound streak numbers
 * arriving from a browser's localStorage.
 */
export const getPublishedPuzzleCount = cache(async (packId: string): Promise<number> => {
  const { count } = await createAdminClient()
    .from("puzzles")
    .select("id", { count: "exact", head: true })
    .eq("pack_id", packId)
    .lte("date", todayUtc());

  return count ?? 0;
});

/** `hints` is jsonb and the array columns are nullable — don't trust either. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
