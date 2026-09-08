"use client";

import { useActionState, useState } from "react";

import { updateBioAction } from "@/app/settings/actions";
import { MAX_BIO_LENGTH } from "@/lib/profile/types";

export function BioForm({ initialBio }: { initialBio: string }) {
  const [state, formAction, pending] = useActionState(updateBioAction, {});
  const [value, setValue] = useState(initialBio);

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="bio" className="block text-sm font-medium">
        Bio
      </label>
      <textarea
        id="bio"
        name="bio"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX_BIO_LENGTH}
        className="w-full resize-y rounded-md border border-ink/25 bg-parchment px-3 py-2 text-sm focus-visible:border-ochre focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ochre"
        placeholder="A line or two about you. Shown on your public profile."
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          {value.length} / {MAX_BIO_LENGTH}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-parchment transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      <p aria-live="polite" className="min-h-[1.25rem] text-sm">
        {state.error && <span className="text-brick">{state.error}</span>}
        {state.message && <span className="text-moss">{state.message}</span>}
      </p>
    </form>
  );
}
