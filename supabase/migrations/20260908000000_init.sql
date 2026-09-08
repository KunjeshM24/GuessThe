-- Daily Dex — initial schema. Implements GamePlan.md Section 8.
--
-- Row Level Security is enabled on every table below. Postgres denies any
-- operation a role has no matching policy for, so "no policy" means "not
-- reachable with the anon key". Server code that legitimately needs wider
-- access uses the service-role key, which bypasses RLS
-- (src/lib/supabase/server.ts -> createAdminClient).

create extension if not exists pgcrypto;

-- packs ---------------------------------------------------------------------

create table public.packs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  is_live     boolean not null default false,
  -- slug doubles as the pack's subdomain (GamePlan.md Section 4).
  constraint packs_slug_format check (slug ~ '^[a-z0-9-]+$')
);

-- puzzles -------------------------------------------------------------------

create table public.puzzles (
  id             uuid primary key default gen_random_uuid(),
  pack_id        uuid not null references public.packs (id) on delete cascade,
  date           date not null,
  answer         text not null,
  -- Ordered easy -> hard (GamePlan.md Section 3).
  hints          jsonb not null default '[]'::jsonb,
  hero_image_url text,
  -- One puzzle per pack per day: this is what makes the daily puzzle
  -- deterministic, and it is also the (pack_id, date) lookup index.
  constraint puzzles_pack_date_unique unique (pack_id, date),
  constraint puzzles_hints_is_array check (jsonb_typeof(hints) = 'array')
);

-- users ---------------------------------------------------------------------
-- Public profile data. Credentials, sessions and password hashes live in
-- auth.users, managed entirely by Supabase Auth (GamePlan.md Section 5.5).

create table public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null,
  -- Mirror of auth.users.email, kept because GamePlan.md Section 8 lists it.
  -- No policy below ever exposes it; read it server-side.
  email      text,
  avatar_url text,
  bio        text,
  created_at timestamptz not null default now(),
  constraint users_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint users_bio_length check (bio is null or char_length(bio) <= 300)
);

-- Usernames are case-insensitively unique (/u/username resolves to one user).
create unique index users_username_lower_key on public.users (lower(username));

-- TODO (roadmap step 5, accounts/auth): add the auth.users -> public.users
-- trigger that provisions a profile row on signup. It needs a username
-- generation/collision strategy, which is a decision for that step.

-- solves --------------------------------------------------------------------
-- Single source-of-truth event table feeding heatmap, streaks, badges,
-- leaderboard and the recent-activity feed (GamePlan.md Section 8).

create table public.solves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  puzzle_id    uuid not null references public.puzzles (id) on delete cascade,
  guesses_used smallint not null check (guesses_used >= 0),
  solved_at    timestamptz not null default now(),
  won          boolean not null,
  -- One result per user per puzzle. Also serves as the solves.user_id index.
  constraint solves_user_puzzle_unique unique (user_id, puzzle_id)
);

create index solves_puzzle_id_idx on public.solves (puzzle_id);
-- Heatmap and recent-activity feed scan one user's solves in date order.
create index solves_user_solved_at_idx on public.solves (user_id, solved_at desc);

-- streaks -------------------------------------------------------------------

create table public.streaks (
  user_id          uuid not null references public.users (id) on delete cascade,
  -- NULL = the combined all-packs streak (GamePlan.md Section 5.2).
  pack_id          uuid references public.packs (id) on delete cascade,
  current_streak   integer not null default 0 check (current_streak >= 0),
  longest_streak   integer not null default 0 check (longest_streak >= 0),
  last_played_date date,
  -- NULLS NOT DISTINCT so a user gets exactly one combined-streak row.
  constraint streaks_user_pack_unique unique nulls not distinct (user_id, pack_id)
);

-- badges --------------------------------------------------------------------

create table public.badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  icon_url    text
);

-- user_badges ---------------------------------------------------------------

create table public.user_badges (
  user_id   uuid not null references public.users (id) on delete cascade,
  badge_id  uuid not null references public.badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index user_badges_badge_id_idx on public.user_badges (badge_id);

-- Row Level Security --------------------------------------------------------

alter table public.packs       enable row level security;
alter table public.puzzles     enable row level security;
alter table public.users       enable row level security;
alter table public.solves      enable row level security;
alter table public.streaks     enable row level security;
alter table public.badges      enable row level security;
alter table public.user_badges enable row level security;

-- packs: public catalogue. Backlog packs stay invisible until is_live flips.
create policy "live packs are publicly readable"
  on public.packs for select
  to anon, authenticated
  using (is_live);

-- puzzles: deliberately NO client-readable policy.
--
-- GamePlan.md Section 5.5 requires that a day's answer is never retrievable
-- from the client before the player has solved or failed it, and RLS cannot
-- hide a single column. So puzzles are server-only: read them with the
-- service-role client and return just the fields the player may see. If a
-- public puzzle feed is later needed (archive pages, SEO), add a view that
-- omits `answer` rather than opening a select policy here.

-- users: own row only. Public profile pages (/u/username) need cross-user
-- reads of username/avatar/bio; serve those from server components, or add a
-- view exposing only those columns — do not widen this policy, it would leak
-- every user's email.
create policy "users read own profile"
  on public.users for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "users insert own profile"
  on public.users for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "users update own profile"
  on public.users for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- solves: append-only, own rows. No update or delete policy, so a recorded
-- result cannot be rewritten after the fact.
create policy "users read own solves"
  on public.solves for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own solves"
  on public.solves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- streaks: own rows.
create policy "users read own streaks"
  on public.streaks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own streaks"
  on public.streaks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users update own streaks"
  on public.streaks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- badges: the catalogue is public, nothing secret in it.
create policy "badges are publicly readable"
  on public.badges for select
  to anon, authenticated
  using (true);

-- user_badges: own rows readable. Awarding is server-side only (roadmap step
-- 8), so there is no insert policy — a client cannot grant itself a badge.
create policy "users read own badges"
  on public.user_badges for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Seed ----------------------------------------------------------------------
-- Launch packs (GamePlan.md Sections 2 and 3). Mirrors src/packs/registry.ts.
-- is_live stays false until the engine ships in roadmap step 2.

insert into public.packs (slug, name, description, is_live) values
  ('trees',   'Tree of the Day',   'Name the tree from its bark, leaf and habit.',      false),
  ('objects', 'Object of the Day', 'Name the everyday object from cropped close-ups.',  false)
on conflict (slug) do nothing;

-- The starter badge catalogue (GamePlan.md Section 5.3) is seeded in roadmap
-- step 8, alongside the award rules that define each slug.
