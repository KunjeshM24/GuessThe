# Engine (pack-agnostic)

Shared puzzle engine — built in roadmap step 2 (GamePlan.md Section 9).

Everything here must work for any pack: daily puzzle selection by date + pack,
server-side guess validation, hint reveal, win/lose state, share-card text.
No pack-specific answers, hint copy or feedback rules — those belong in
`src/packs/<slug>/`, reached only via `src/packs/registry.ts`.

If a change here needs to know which pack it is beyond the registry's data,
that's the signal the abstraction is wrong.
