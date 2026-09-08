import Link from "next/link";
import { redirect } from "next/navigation";

import { BioForm } from "@/components/profile/BioForm";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");

  // Own row, so the ordinary user-scoped client and the existing "users read
  // own profile" policy are enough — no elevated access needed.
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("bio")
    .eq("id", viewer.id)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <h1 className="font-display text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Signed in as {viewer.username}.{" "}
        <Link
          href={`/u/${viewer.username}`}
          className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
        >
          View your profile
        </Link>
        .
      </p>

      <div className="mt-8">
        <BioForm initialBio={data?.bio ?? ""} />
      </div>

      <p className="mt-8 text-xs text-ink-faint">
        Username changes and avatar uploads aren&apos;t built yet. Your avatar comes
        from your Google account if you signed in with one.
      </p>
    </main>
  );
}
