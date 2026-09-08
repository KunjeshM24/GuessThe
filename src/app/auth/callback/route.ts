import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Where Google (and the email-confirmation link) come back to.
 *
 * Trades the one-time code for a session; the cookies are written by the
 * server client, which can set them here because a Route Handler owns its
 * response.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Only ever redirect within this site — an absolute `next` would make this
  // an open redirect that phishing could point anywhere.
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/play/trees";

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
