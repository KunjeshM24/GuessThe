"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getViewer } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_BIO_LENGTH } from "@/lib/profile/types";
import { createClient } from "@/lib/supabase/server";

export type SettingsFormState = { error?: string; message?: string };

const SAVES_PER_MINUTE = 10;

/**
 * Update the signed-in user's bio.
 *
 * Writes through the user-scoped client, so the "users update own profile"
 * RLS policy — not this function — is what guarantees a caller can only edit
 * their own row. The length limit is enforced here *and* by a CHECK
 * constraint, because this is a trust boundary (GamePlan.md Section 5.5).
 */
export async function updateBioAction(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You need to be signed in." };

  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`bio:${viewer.id}:${ip}`, SAVES_PER_MINUTE, 60_000)) {
    return { error: "Too many changes at once. Try again in a minute." };
  }

  // Normalise before measuring: standardise line endings, strip every other
  // control character (\p{C} would eat the newlines too, hence the split),
  // collapse runs of blank lines, trim. React escapes on render, so this is
  // about tidiness and a truthful character count, not about XSS.
  const bio = String(formData.get("bio") ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\p{C}/gu, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (bio.length > MAX_BIO_LENGTH) {
    return { error: `Bios are limited to ${MAX_BIO_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ bio: bio.length > 0 ? bio : null })
    .eq("id", viewer.id);

  if (error) return { error: "Couldn't save that. Try again in a moment." };

  revalidatePath(`/u/${viewer.username}`);
  return { message: "Saved." };
}
