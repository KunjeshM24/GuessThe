"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInWithGoogleAction } from "@/app/(auth)/actions";
import type { AuthFormState } from "@/app/(auth)/actions";

type Mode = "sign-in" | "sign-up";

const COPY: Record<Mode, { title: string; submit: string; altText: string; altHref: string; altLink: string }> = {
  "sign-in": {
    title: "Sign in",
    submit: "Sign in",
    altText: "No account yet?",
    altHref: "/sign-up",
    altLink: "Create one",
  },
  "sign-up": {
    title: "Create an account",
    submit: "Create account",
    altText: "Already have one?",
    altHref: "/sign-in",
    altLink: "Sign in",
  },
};

export function AuthForm({
  mode,
  action,
  notice,
}: {
  mode: Mode;
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  notice?: string;
}) {
  const copy = COPY[mode];
  const [state, formAction, pending] = useActionState(action, {});
  const [googleState, googleAction, googlePending] = useActionState(
    async () => signInWithGoogleAction(),
    {} as AuthFormState,
  );

  const error = state.error ?? googleState.error ?? notice;

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-3xl">{copy.title}</h1>
      <p className="mt-1 text-sm text-ink-faint">
        An account syncs your streaks across devices. Playing works without one.
      </p>

      <form action={googleAction} className="mt-6">
        <button
          type="submit"
          disabled={googlePending}
          className="w-full rounded-md border border-ink/25 bg-parchment px-4 py-2.5 text-sm font-medium transition-colors hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre disabled:opacity-50"
        >
          {googlePending ? "Redirecting…" : "Continue with Google"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-ink-faint">
        <span className="h-px flex-1 bg-ink/15" />
        or
        <span className="h-px flex-1 bg-ink/15" />
      </div>

      <form action={formAction} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-md border border-ink/25 bg-parchment px-3 py-2 focus-visible:border-ochre focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ochre"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-ink/25 bg-parchment px-3 py-2 focus-visible:border-ochre focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ochre"
          />
          {mode === "sign-up" && (
            <p className="mt-1 text-xs text-ink-faint">At least 8 characters.</p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-parchment transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre disabled:opacity-50"
        >
          {pending ? "…" : copy.submit}
        </button>
      </form>

      <p aria-live="polite" className="mt-3 min-h-[1.25rem] text-sm">
        {error && <span className="text-brick">{error}</span>}
        {state.message && <span className="text-moss">{state.message}</span>}
      </p>

      <p className="mt-4 text-sm text-ink-faint">
        {copy.altText}{" "}
        <Link
          href={copy.altHref}
          className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
        >
          {copy.altLink}
        </Link>
      </p>
    </div>
  );
}
