"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SITE_URL } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  /** Shown in place of a redirect when the account needs email confirmation. */
  message?: string;
};

/** Supabase's own default minimum is 6; 8 is the cheapest real improvement. */
const MIN_PASSWORD_LENGTH = 8;

/** Signups are expensive to clean up, so they are the tighter limit. */
const SIGNUPS_PER_HOUR = 5;
/** Loose enough for a forgotten password, tight enough to stall stuffing. */
const SIGN_INS_PER_15_MIN = 10;

async function clientIp(): Promise<string> {
  // Vercel overwrites x-forwarded-for at the edge, so it is trustworthy there.
  // Behind any other proxy, confirm the same before relying on this.
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

/**
 * Absolute origin for OAuth round trips.
 *
 * Derived from the request rather than from SITE_URL so Vercel preview
 * deployments send Google back to the preview, not to production.
 */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return SITE_URL;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Server-side validation — the browser's `required`/`type=email` is a hint, not a check. */
function readCredentials(formData: FormData): { email: string; password: string } | string {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (email.length < 3 || email.length > 254 || !email.includes("@")) {
    return "Enter a valid email address.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 72) {
    // bcrypt silently truncates past 72 bytes; refuse rather than mislead.
    return "That password is too long — 72 characters maximum.";
  }
  return { email, password };
}

/**
 * Errors the player can actually do something about get Supabase's own wording;
 * everything else gets a generic line.
 *
 * Passing `error.message` straight through leaks internals — an unreachable
 * auth service surfaced to users as the literal text "fetch failed" before
 * this existed.
 */
const ACTIONABLE_SIGNUP_ERRORS = new Set([
  "weak_password",
  "user_already_exists",
  "email_address_invalid",
  "email_address_not_authorized",
  "signup_disabled",
  "over_email_send_rate_limit",
]);

function signUpErrorMessage(error: { code?: string; message: string }): string {
  if (error.code && ACTIONABLE_SIGNUP_ERRORS.has(error.code)) return error.message;
  return "Couldn't create that account right now. Try again in a moment.";
}

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const credentials = readCredentials(formData);
  if (typeof credentials === "string") return { error: credentials };

  if (!rateLimit(`signup:${await clientIp()}`, SIGNUPS_PER_HOUR, 3_600_000)) {
    return { error: "Too many sign-up attempts. Try again in a little while." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...credentials,
    options: { emailRedirectTo: `${await origin()}/auth/callback` },
  });

  if (error) return { error: signUpErrorMessage(error) };

  // With email confirmation enabled (Supabase's default) there is no session
  // yet — the profile row and the streak merge both wait for the click.
  if (!data.session) {
    return { message: "Check your email to confirm your account, then sign in." };
  }

  redirect("/play/trees");
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const credentials = readCredentials(formData);
  if (typeof credentials === "string") {
    // Don't leak which half was wrong on an existing account.
    return { error: "That email and password don't match an account." };
  }

  if (!rateLimit(`signin:${await clientIp()}`, SIGN_INS_PER_15_MIN, 900_000)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) return { error: "That email and password don't match an account." };

  redirect("/play/trees");
}

export async function signInWithGoogleAction(): Promise<AuthFormState> {
  if (!rateLimit(`oauth:${await clientIp()}`, SIGN_INS_PER_15_MIN, 900_000)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback` },
  });

  if (error || !data.url) return { error: "Couldn't reach Google. Try again." };

  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
