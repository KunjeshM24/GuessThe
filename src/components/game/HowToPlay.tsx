"use client";

import { useRef } from "react";

/**
 * Pack-specific "How to play" (GamePlan.md Section 5.1).
 *
 * Built on the native <dialog> element, which brings the focus trap, the
 * Escape handler, inert background and the top layer with it — all things a
 * hand-rolled modal has to reimplement and usually gets wrong.
 */
export function HowToPlay({ packName, steps }: { packName: string; steps: readonly string[] }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="rounded-full border border-ink/25 px-3 py-1 text-xs font-medium tracking-wide text-ink-faint transition-colors hover:border-ink/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
      >
        How to play
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border-2 border-ink/20 bg-parchment p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="p-6">
          <h2 className="font-display text-2xl">{packName}</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink-faint">
            How to play
          </p>

          <ol className="mt-5 space-y-3 text-sm leading-relaxed">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-parchment-dark text-[0.65rem] font-semibold text-ink"
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <form method="dialog" className="mt-6 flex justify-end">
            <button className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre">
              Got it
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
