import Link from "next/link";

import { signOutAction } from "@/app/(auth)/actions";
import { getViewer } from "@/lib/auth";
import { getVisiblePacks } from "@/lib/packs.server";

/**
 * Site-wide navigation, rendered from the root layout so every page — hub,
 * pack, leaderboard, profile, settings, auth — gets the same one.
 *
 * Pack links come from `getVisiblePacks()`, so an unlaunched pack is absent
 * from the nav for the public and present in local preview mode. Nothing here
 * hard-codes a pack.
 */
export async function SiteHeader() {
  const [viewer, packs] = await Promise.all([getViewer(), getVisiblePacks()]);

  return (
    <header className="border-b border-ink/10">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="font-display text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
        >
          Daily Dex
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {packs.map((pack) => (
            <NavLink key={pack.slug} href={`/play/${pack.slug}`}>
              {pack.name.replace(" of the Day", "")}
            </NavLink>
          ))}
          <NavLink href="/leaderboard">Leaderboard</NavLink>
        </nav>

        <div className="ms-auto flex items-center gap-3 text-sm">
          {viewer ? (
            <>
              <NavLink href={`/u/${viewer.username}`}>{viewer.username}</NavLink>
              <form action={signOutAction}>
                <button className="rounded-full border border-ink/25 px-3 py-1 text-xs font-medium text-ink-faint transition-colors hover:border-ink/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <NavLink href="/sign-in">Sign in</NavLink>
              <Link
                href="/sign-up"
                className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-parchment transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-ink-faint underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
    >
      {children}
    </Link>
  );
}
