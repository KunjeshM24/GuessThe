import "server-only";

import { cache } from "react";

import { PREVIEW_UNLISTED_PACKS } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/server";
import { getPack, isPackSlug } from "@/packs/registry";
import type { Pack, PackSlug } from "@/packs/registry";

/**
 * Which packs a visitor is allowed to see.
 *
 * The database owns `is_live`; the registry owns the copy. This joins the two
 * and applies the one rule that matters for launch: **only live packs are
 * listed**, unless `PREVIEW_UNLISTED_PACKS` is set, which is a local-only
 * escape hatch for reviewing a pack before flipping its flag.
 *
 * Reads with the admin client because the `packs` select policy only exposes
 * rows where `is_live` — a preview mode built on the anon key could not see
 * the very rows it exists to show. Pack names are not secret; the answers
 * behind them are, and those are nowhere near this.
 */
export type VisiblePack = Pack & { isLive: boolean };

export const getVisiblePacks = cache(async (): Promise<VisiblePack[]> => {
  try {
    const { data } = await createAdminClient()
      .from("packs")
      .select("slug, is_live")
      .order("slug");

    return (data ?? [])
      // A row whose slug the registry does not know has no copy and no route,
      // so it cannot be rendered — skip it rather than crash the header.
      .filter((row) => isPackSlug(row.slug as string))
      .map((row) => ({ ...getPack(row.slug as PackSlug), isLive: row.is_live as boolean }))
      .filter((pack) => pack.isLive || PREVIEW_UNLISTED_PACKS);
  } catch {
    // The header calls this on every request. A database blip should cost the
    // nav links, not the whole site.
    return [];
  }
});

/** Whether a specific pack may be shown at all. */
export async function isPackVisible(slug: PackSlug): Promise<boolean> {
  return (await getVisiblePacks()).some((pack) => pack.slug === slug);
}
