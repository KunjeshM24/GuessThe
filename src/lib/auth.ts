import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  email: string | null;
  username: string;
};

/**
 * The signed-in user, or null.
 *
 * `getUser()` rather than `getSession()`: the session is read from a cookie
 * the browser could have tampered with, whereas `getUser()` validates it with
 * the auth server. Anything that gates access must use this one.
 *
 * `cache()` dedupes it within a single render pass, so the header and a page
 * asking the same question cost one round trip, not two.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // The profile row is created by the on_auth_user_created trigger. If it is
    // somehow missing, fall back rather than throwing a signed-in user out.
    const { data: profile } = await supabase
      .from("users")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email ?? null,
      username: profile?.username ?? user.email?.split("@")[0] ?? "player",
    };
  } catch {
    // The root layout calls this on every request. If the auth service is
    // unreachable, degrade to signed-out rather than 500 the whole site —
    // the game itself is playable without an account anyway.
    return null;
  }
});
