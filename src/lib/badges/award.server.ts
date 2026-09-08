import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

import { BADGE_RULES, badgesToAward } from "./rules";
import type { BadgeContext } from "./rules";

/**
 * The shared badge service (GamePlan.md Section 5.4: "badge/streak/heatmap
 * logic lives in one shared service reading from a single solves/events
 * table"). Every pack feeds it; nothing here is pack-specific.
 *
 * Runs on the admin client because `user_badges` deliberately has no client
 * insert policy — a player must not be able to grant themselves a badge. The
 * only trigger is a solve the server itself has already verified.
 */

/** Awarding is best-effort: a badge failure must never fail a player's solve. */
export type AwardResult = { awarded: string[] };

export async function loadBadgeContext(userId: string): Promise<BadgeContext | null> {
  const { data, error } = await createAdminClient().rpc("badge_context", {
    p_user_id: userId,
  });

  if (error || !data) return null;
  return data as BadgeContext;
}

/**
 * Make sure every rule in the catalogue has a `badges` row, so `user_badges`
 * has something to reference.
 *
 * Idempotent, and cheap enough to be self-healing: if someone adds a rule and
 * forgets to run `npm run badges`, the first person to qualify creates the
 * row rather than silently earning nothing.
 */
export async function syncBadgeCatalog(): Promise<Map<string, string>> {
  const supabase = createAdminClient();

  await supabase.from("badges").upsert(
    BADGE_RULES.map((rule) => ({
      slug: rule.slug,
      name: rule.name,
      description: rule.description,
    })),
    { onConflict: "slug" },
  );

  const { data } = await supabase.from("badges").select("id, slug");
  return new Map((data ?? []).map((row) => [row.slug as string, row.id as string]));
}

/**
 * Evaluate every rule for one player and insert whatever is newly earned.
 *
 * Double-awarding is impossible: `user_badges` is keyed on
 * (user_id, badge_id), and this inserts with `ignoreDuplicates`, so a rule
 * that stays true forever still only ever produces one row. That is what
 * makes the backfill safe to run repeatedly.
 */
export async function awardBadges(userId: string): Promise<AwardResult> {
  const context = await loadBadgeContext(userId);
  if (!context) return { awarded: [] };

  const supabase = createAdminClient();

  // What the player already holds, so nothing is awarded (or re-stamped) twice.
  const { data: existing } = await supabase
    .from("user_badges")
    .select("badge_id, badges!inner(slug)")
    .eq("user_id", userId);

  const held = (existing ?? []).map(
    (row) => (row as unknown as { badges: { slug: string } }).badges.slug,
  );

  const missing = badgesToAward(context, held);
  if (missing.length === 0) return { awarded: [] };

  // Only touch the catalogue when something is actually being awarded.
  const catalogue = await syncBadgeCatalog();

  const rows = missing
    .map((slug) => catalogue.get(slug))
    .filter((id): id is string => Boolean(id))
    .map((badgeId) => ({ user_id: userId, badge_id: badgeId }));

  if (rows.length === 0) return { awarded: [] };

  const { error } = await supabase
    .from("user_badges")
    .upsert(rows, { onConflict: "user_id,badge_id", ignoreDuplicates: true });

  if (error) return { awarded: [] };
  return { awarded: missing };
}
