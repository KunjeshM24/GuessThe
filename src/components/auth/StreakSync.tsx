"use client";

import { useEffect, useRef } from "react";

import { mergeLocalStreaksAction } from "@/app/actions/streaks";
import { readStreaks } from "@/lib/engine/local-state";

/**
 * One flag per account, so signing in as somebody else on a shared browser
 * still syncs.
 *
 * Keyed on username rather than user id: this component is a Client Component,
 * so whatever it is handed is serialised into the page source, and there is no
 * reason to put an internal uuid there when a public username namespaces the
 * key just as well.
 */
const syncedKey = (username: string) => `dailydex.streaksync.${username}.v1`;

/**
 * Carries a device's anonymous streaks into the account on first sign-in
 * (GamePlan.md Section 5.2).
 *
 * Renders nothing. It lives in the root layout rather than on the game page so
 * it fires wherever a sign-in lands — the OAuth callback and the email
 * confirmation link both come back to arbitrary routes.
 *
 * Runs once per account per device. The merge itself is idempotent, so the
 * flag is an optimisation rather than a correctness requirement; a cleared
 * localStorage just means one extra call.
 */
export function StreakSync({ username }: { username: string }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let local;
    try {
      if (window.localStorage.getItem(syncedKey(username))) return;
      local = readStreaks();
    } catch {
      return; // Storage blocked — nothing to migrate.
    }

    // Nothing played anonymously on this device: skip the round trip.
    const hasAnything =
      local.combined.lastPlayedDate !== null ||
      Object.values(local.packs).some((record) => record.lastPlayedDate !== null);
    if (!hasAnything) return;

    void mergeLocalStreaksAction(local).then((result) => {
      // Only mark it done on success, so a transient failure retries next load.
      if (!result.ok) return;
      try {
        window.localStorage.setItem(syncedKey(username), new Date().toISOString());
      } catch {
        // Not fatal — the merge already happened, and it is idempotent.
      }
    });
  }, [username]);

  return null;
}
