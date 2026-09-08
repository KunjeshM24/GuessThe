# Daily Dex

A daily guessing-game platform — the Wordle mechanic across themed niche packs
(Tree of the Day, Object of the Day), sharing one account, streak and badge
system. See `GamePlan.md` for the full product spec; it is the reference for
any decision not covered here.

Currently at roadmap steps 1-11: the shared puzzle engine, both launch packs
with 30 days of content each, the share card, anonymous streaks, accounts with
anonymous-streak migration, public profile pages, badges, the leaderboard, the
hub homepage with subdomain routing, and the archive with SEO metadata.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres +
Auth) · deployed on Vercel.

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev
```

Opens on http://localhost:3000.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (also typechecks) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Node's built-in test runner over `*.test.ts` |
| `npm run seed` | Seed a pack's puzzles (`npm run seed -- objects` for another pack) |
| `npm run badges` | Sync the badge catalogue and back-fill awards (`-- --dry` to preview) |
| `npm run check:db` | Supabase connectivity smoke test |

## Environment variables

`.env.example` is the authoritative list — every variable the app reads is in
it. Copy it to `.env.local` (gitignored) and fill in real values from your
Supabase project's API settings.

| Variable | Exposed to browser? |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes — public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes — public by design, RLS is the gate |
| `SUPABASE_SERVICE_ROLE_KEY` | **No.** Bypasses RLS |

Only `NEXT_PUBLIC_`-prefixed values reach the client bundle. Secrets are read
exclusively through `src/lib/env.server.ts`, which imports `server-only` — so
importing it from a Client Component fails the build rather than leaking.
Never add a `NEXT_PUBLIC_` prefix to a secret.

## Database

Schema lives in `supabase/migrations/`. Row Level Security is enabled on every
table with policies defined in the same migration.

Apply it either way:

**Supabase CLI** (preferred — keeps migration history):

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Dashboard**: paste the contents of the migration file into the Supabase SQL
Editor and run it.

To reset a local Supabase stack instead:

```bash
npx supabase start
npx supabase db reset
```

### Seeding puzzle content

Puzzle content lives in `content/packs/<slug>.json` — outside `src/` on purpose,
so no client component can import an answer by accident. Seed it after the
migrations:

```bash
npm run seed
```
```bash
npm run seed -- objects
```

Each writes 30 puzzles dated sequentially from today (UTC). It is idempotent:
re-running after editing the JSON overwrites the same `(pack_id, date)` rows
rather than duplicating them. Both packs stay `is_live = false` until you flip
them yourself.

## Auth

Supabase Auth, email/password plus Google. Playing never requires an account —
an account syncs streaks across devices and unlocks the profile page (roadmap
step 7).

**Supabase dashboard setup**, none of which lives in this repo:

1. *Authentication -> Providers -> Google*: enable it and paste a client ID and
   secret from a Google Cloud OAuth 2.0 credential.
2. In Google Cloud, set the authorised redirect URI to
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. *Authentication -> URL Configuration*: set Site URL, and add
   `http://localhost:3000/auth/callback` plus your production callback to the
   redirect allow-list.
4. *Authentication -> Providers -> Email*: decide whether to keep "Confirm
   email" on. It is on by default, and the sign-up form handles both cases —
   with it on there is no session until the emailed link is clicked.

### Usernames

A profile row in `public.users` is created by the `on_auth_user_created`
trigger the moment Supabase Auth creates an account. The username is derived
from the email local part, stripped to `[A-Za-z0-9_]` and truncated to 14
characters; anything shorter than three characters falls back to `player`.

Collisions are resolved by **catching the unique violation and retrying** —
`ada`, `ada1`, `ada2` — rather than by checking for a free name first, because
a pre-flight `SELECT` races against a concurrent signup. After 30 sequential
attempts it switches to a random six-digit suffix and gives up at 40, so the
signup transaction can never hang.

### Streak migration

Signing in on a device that has anonymous streaks folds them into the account
(`<StreakSync />` -> `mergeLocalStreaksAction`). The merge rule is chosen to
**never inflate**, because badges and the leaderboard read these numbers:

- `longestStreak` — the maximum of both sides, always.
- `lastPlayedDate` — the later of the two.
- `currentStreak` — whichever side has the later `lastPlayedDate`, since a
  current streak only means something relative to the day it last advanced. A
  40-day run that died in March loses to a 2-day run still alive today.
- One exception: if the later side covers exactly one day and that day is
  immediately after the earlier side's last, they chain — 40 days ending
  yesterday plus today is 41, not 1. This is the only case where joining them
  cannot double-count.

Numbers arriving from localStorage are validated for shape and then clamped to
the number of puzzles the pack has actually published, so an edited blob cannot
mint a 400-day streak out of a 12-day-old pack. The merge is idempotent, so
running it twice changes nothing.

### Access rules worth knowing

- `puzzles` has **no** client-readable policy on purpose. Answers must never be
  retrievable before a player has solved or failed the day's puzzle
  (`GamePlan.md` §5.5), and RLS cannot hide a single column — so all puzzle
  reads go through server code using `createAdminClient()`.
- `packs` and `badges` are publicly readable; `packs` only when `is_live`.
- `users`, `solves`, `streaks` and `user_badges` are own-row only. `solves` is
  append-only from the client, and badges have no client insert policy at all.

## Layout

```
content/packs/       Puzzle content (answers!) — outside src/ by design
src/
  app/
    (auth)/          Sign-in and sign-up pages + their server actions
    auth/callback/   OAuth and email-confirmation return route
    actions/         Cross-route server actions (streak merge)
    play/[pack]/     The gameplay page + its guess server action
  components/game/   Shared, pack-agnostic gameplay UI
  lib/
    engine/          Pack-agnostic puzzle engine
      puzzle.ts        Server-only daily resolution (admin client)
      guess.ts         Normalisation, grading, win/lose, reveal gating
      share.ts         Emoji-grid result card
      streak.ts        Pure streak arithmetic
      local-state.ts   localStorage streaks + in-progress guesses
      date.ts          UTC game-day helpers
    supabase/        DB clients — client.ts (browser), server.ts (server/admin)
    auth.ts          getViewer() — the signed-in user, request-cached
    streaks.server.ts  Durable streaks + the anonymous merge
    env.ts           Public env
    env.server.ts    Secrets, guarded by `server-only`
    rate-limit.ts    Reusable limiter for write endpoints
  packs/
    registry.ts      Pack identity + UI copy; the only bridge engine -> pack
  proxy.ts           Subdomain routing (stub — roadmap step 10)
supabase/migrations/ SQL schema + RLS policies
```

The split that matters: nothing in `lib/engine/` may know about a specific pack
except through `packs/registry.ts`. Adding a third pack should mean adding an
entry there, a `content/packs/<slug>.json`, and a row in `packs` — not editing
the engine.

`src/proxy.ts` is the Next 16 name for what used to be `middleware.ts` — same
file convention, renamed upstream.

## How the game stays honest

The answer never reaches the browser for an unsolved puzzle. Concretely:

- `puzzles` has no client-readable RLS policy, so the anon key cannot read it
  at all. Resolution happens server-side via `createAdminClient()`.
- The page sends the client a `PublicGameState`, never a `Puzzle`. `reveal` is
  `null` until the server itself concludes the game is won or lost.
- Only unlocked hints are sent — hints the player has not earned stay server-side.
- The client owns its guess list (there are no accounts yet), but the server
  re-grades every guess on each submission and decides win/lose itself. A client
  can assert what it typed, never what that means.
- `getDailyPuzzle()` takes no date parameter, so no request can steer it at a
  future puzzle.
- The guess action is rate limited per IP, and validates the guess list's type,
  length and size before touching the database.
- Solves and streaks are written from the server's own verdict on a finished
  game, never from a client claim, and deduplicated by the unique constraint on
  `(user_id, puzzle_id)`.

Rate limits, all per IP (`src/lib/rate-limit.ts`):

| Endpoint | Limit |
| --- | --- |
| Guess submission | 30 / minute |
| Sign-up | 5 / hour |
| Sign-in and Google OAuth start | 10 / 15 minutes |
| Anonymous streak merge | 10 / hour, keyed by user as well as IP |

Two content rules back this up, both enforced by `content/packs/*.test.ts`:
no hint may contain its own answer or close terms, and no pack UI copy
(placeholder, how-to-play) may name anything that is an answer in that pack.

## Profiles

Public at `/u/<username>`, readable signed in or out. `/settings` edits your
own bio; nothing else is editable yet (no username change, no avatar upload).

### How a public page reads private tables

Every table a profile needs — `users`, `solves`, `streaks`, `user_badges` — is
own-row-only under RLS, and widening those policies would expose far more than
a profile should: `users` carries `email`, and `solves` carry a `puzzle_id`
that maps to answers.

So the public surface is two `security definer` functions
(`supabase/migrations/20260911000000_profile_queries.sql`) called with the
ordinary anon key — **not** the admin client. They are the only thing crossing
the per-user boundary, and they return an explicit field list that contains no
email, no row ids and no answers. That keeps the privacy boundary in one
auditable place instead of spread across five policies.

There is a second boundary in the app: `<ActivityFeed>` is a Client Component,
so whatever object it receives is serialised into the RSC payload in full —
including properties nothing renders. `toPublicActivity()` projects each row
down to the six public fields before it crosses, both on the page and in the
load-more action. This is a backstop, not the primary control, and it exists
because planting an `email` field on those rows put it in the page source 20
times during testing.

### What the numbers mean

- **Solved per pack** counts wins; the "of N" beside it counts attempts.
- **Heatmap** is the past 53 weeks, one cell per day, grouped on the puzzle's
  *game day* rather than when it was submitted — so it agrees with the streaks,
  which are also keyed on game day. Shading runs over four steps from
  parchment-dark to full moss, where full moss means every live pack was played
  that day. With two live packs only three of the four shades can occur; the
  fourth appears at three packs. Before launch, when nothing is `is_live`, the
  denominator falls back to the total pack count.
- **Streak stats** come from the `pack_id IS NULL` combined row.
- **Rank** is position by total wins, computed with a window function in one
  query. Players with no wins are unranked rather than tied for last.
  GamePlan.md Section 10 leaves the formula open to refine on real data.
- **Badges** are empty for everyone until roadmap step 8. That is the normal
  state, not an error.

## Packs, subdomains and preview mode

The bare domain serves the hub, which links to every pack that is `is_live`.
Each pack also answers on its own subdomain — `trees.example.com/` serves the
Tree of the Day page. The mapping is `packSlugForHost()` in `src/lib/host.ts`:
the first label of the hostname is looked up in the pack registry, so adding a
pack needs no routing change at all.

Only the **root path** is rewritten. `/leaderboard` and `/u/ada` work the same
on every host, so a subdomain is a front door rather than a separate site — one
set of routes, one session.

Visibility is decided by the page, not the proxy. `src/proxy.ts` runs on every
request, and putting a database lookup there would sit a query in front of the
whole site; `/play/[pack]` checks for itself, so an unlaunched subdomain 404s
at the page.

### Testing it without a domain

`*.localhost` resolves to 127.0.0.1 in most browsers, so this works today:

```bash
curl -H "Host: trees.localhost:3000" http://127.0.0.1:3000/
```

Or open `http://trees.localhost:3000` directly.

### Preview mode

Production shows only `is_live` packs. To review a pack before flipping its
flag, set this in `.env.local` — **server-only, and never set in production**:

```
PREVIEW_UNLISTED_PACKS=1
```

With it set, unlaunched packs appear in the hub, the nav and the catalog tabs
(marked "Not live"), their subdomains resolve, and the hub shows a banner
saying preview mode is on. With it unset, all of that 404s or disappears.

### Going live on a real domain

None of this is DNS — that part is yours:

1. Add the apex domain and a **wildcard** `*.yourdomain.com` in the Vercel
   project's Domains settings.
2. At the registrar, point the apex at Vercel (an `A`/`ALIAS` record per their
   instructions) and add a `CNAME` for `*` pointing at `cname.vercel-dns.com`.
   The wildcard is what makes a new pack's subdomain work without touching DNS
   again.
3. Set `NEXT_PUBLIC_SITE_URL` to the apex, so share cards stop pointing at
   localhost.

No code change is needed for any of that — the routing reads whatever hostname
arrives.

Known gap: links between packs are root-relative, so following the catalog tab
from `trees.example.com` to Objects lands on `trees.example.com/play/objects`
rather than `objects.example.com`. It works, the URL is just untidy. Worth
making links host-aware once the domain exists.

## Archive and SEO

`/archive/<pack>` lists every **finished** puzzle with its answer, and
`/archive/<pack>/<date>` is each one's own indexable page with its clues, its
fact and its own title, description and canonical URL. This is the long-term
SEO engine (GamePlan.md Section 5.1).

It is also the only surface that publishes answers, which is why the
"already finished" rule is enforced **twice on purpose**:

1. In SQL (`archive_entries`, `archive_entry`), where `date < today` sits
   inside the function so no route, parameter or refactor can skip it. This is
   the real control.
2. In `archive.server.ts`, via `isPastGameDay()` applied to everything on the
   way out — including the previous/next neighbour links, because a "next"
   pointing at today would hand out the live answer one click away.

Duplicating a filter is normally a smell. It is warranted here because the
failure mode is publishing today's answer to a search engine, which cannot be
un-crawled. When the backstop fires it also discounts the reported total, so a
wrong count cannot inflate the page count and manufacture empty archive pages.

Asking for today, tomorrow or any future date returns a 404 — the same as a
date that never existed, so a crawler learns nothing about what is scheduled.

`sitemap.xml` covers the hub, the leaderboard, and each visible pack's play
page, archive index and finished puzzles; it is built from the same
`getArchivePage()` call, so today's puzzle cannot appear there either.
`robots.txt` allows everything public and excludes `/settings`, `/auth/`,
`/sign-in` and `/sign-up`. Profiles stay crawlable on purpose — they are public
and shared result cards link to them.

Site-wide metadata lives in the root layout: a `metadataBase`, a
`%s · Daily Dex` title template so pages set a bare title, and default
OpenGraph fields. **`NEXT_PUBLIC_SITE_URL` must be set before launch** or every
canonical URL and sitemap entry will point at localhost.

Note on `is_live`: the archive functions do not filter on it. Past answers are
destined to be public SEO content regardless; the only true secret is today's
and the future's, which the date filter protects absolutely. Which packs get an
archive *page* is decided by `getVisiblePacks()`, like every other listing.

## Badges

The rule list in `src/lib/badges/rules.ts` is the single source of truth.

**Adding a badge** means appending one object to `BADGE_RULES` and running
`npm run badges`. That script mirrors the catalogue into the `badges` table and
back-fills anyone who already qualifies. The award service, the profile grid
and the backfill all iterate the same list, so nothing else needs editing. If a
new rule needs a fact the rules cannot see, add it to `badge_context()` in
`supabase/migrations/20260912000000_badges_leaderboard.sql` and to
`BadgeContext` — every future rule then gets it for free.

Two constraints on a rule:

- **Pure** — same context in, same answer out, no side effects.
- **Monotonic** — once true it should stay true. Badges are permanent and
  nothing revokes one, which is why the streak rules read `longestStreak`
  rather than `currentStreak`.

Awarding happens server-side in `recordFinishedPuzzle`, immediately after the
solve and streaks are written, so a badge sees the streak that solve just
produced. It runs on the admin client because `user_badges` has no client
insert policy — a player must never be able to grant themselves a badge. It is
also best-effort and wrapped in a try/catch: a badge failure must not throw
away a result the player earned.

Double-awarding is impossible twice over: `badgesToAward()` only returns the
difference against what is already held, and `user_badges` is keyed on
`(user_id, badge_id)` with `ignoreDuplicates` on insert. That is what makes
`npm run badges` safe to run as often as you like — and it matters beyond
tidiness, because re-stamping `earned_at` would scramble the "most recently
earned" highlight on the profile.

Note that **Completionist cannot be earned while no pack is `is_live`** — it
falls back to requiring every pack instead, rather than being vacuously true
for everyone.

## Leaderboard

At `/leaderboard`, with `?scope=daily|all-time` and `?pack=<slug>` (omit for
combined). Filters live in the URL, so every view is linkable, server-rendered
and indexable, and there is no extra endpoint for a client to hammer.

- **All-time** ranks by puzzles won.
- **Daily** ranks by fewest guesses, then earliest finish. Combined-daily ranks
  by most packs solved today first, so playing both packs beats playing one.

Ordering and limiting happen in the database — nothing sorts a user list in
application memory. Results are cached for 60 seconds per
scope-and-pack combination, which is the answer to "don't recompute a full
ranking on every request"; a solve still shows up while you are looking at the
page.

Like the profile, the `leaderboard()` function returns username and avatar and
nothing else, so there is no private field to leak.

## Game day and timezone

A game day is **UTC**, for everyone. GamePlan.md Section 5.1 requires an
identical puzzle for every visitor on a given day, which local dates would
break. Puzzles roll over at 00:00 UTC.
