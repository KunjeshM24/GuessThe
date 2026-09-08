-- Public profile pages (GamePlan.md Section 5.3, roadmap step 7).
--
-- Why functions rather than policies
-- ----------------------------------
-- A profile at /u/<username> is world-readable, but every table it needs
-- (users, solves, streaks, user_badges) is own-row-only under RLS, and
-- widening those policies would expose far more than a profile should — the
-- users table carries `email`, and solves carry a puzzle_id that maps to
-- answers.
--
-- So the public surface is these two `security definer` functions instead.
-- They read across users, and return an explicit list of columns that never
-- includes email, user ids, puzzle ids or answers. That makes the privacy
-- boundary one auditable place rather than a property of five policies.
--
-- Hardening: `set search_path = ''` (so a hijacked search_path cannot
-- redirect a table reference), every identifier schema-qualified, arguments
-- used only as parameters, and EXECUTE revoked from PUBLIC before being
-- granted to the two client roles.

-- Supports the leaderboard-style aggregate in profile_summary: an index-only
-- scan over winning solves instead of a heap scan of the whole table.
create index if not exists solves_won_user_idx
  on public.solves (user_id)
  where won;

-- Recent-activity paging reads one user's solves newest-first.
-- (solves_user_solved_at_idx from the init migration already covers this.)

/**
 * Everything the profile header, stats, streaks, heatmap and badge grid need,
 * in one round trip.
 *
 * Returns NULL when the username does not exist, so the caller can 404.
 *
 * Every value below is either public by nature (username, avatar, bio, join
 * date) or derived (counts, streaks, rank). No email. No row ids. No answers.
 */
create or replace function public.profile_summary(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with target as (
  select u.id, u.username, u.avatar_url, u.bio, u.created_at
  from public.users u
  where lower(u.username) = lower(p_username)
  limit 1
),

-- Puzzles solved per pack. `solved` counts wins; `played` counts attempts,
-- so a pack someone plays but keeps losing still shows up.
pack_totals as (
  select
    pk.slug,
    pk.name,
    count(*) filter (where s.won) as solved,
    count(*)                      as played
  from public.solves s
  join public.puzzles p on p.id = s.puzzle_id
  join public.packs   pk on pk.id = p.pack_id
  where s.user_id = (select id from target)
  group by pk.slug, pk.name
  order by pk.slug
),

-- One row per active day for the heatmap, counting how many distinct packs
-- were played. Grouped on the puzzle's own game day rather than solved_at, so
-- the heatmap agrees with the streaks, which are also keyed on game day.
day_activity as (
  select p.date as day, count(distinct p.pack_id) as packs
  from public.solves s
  join public.puzzles p on p.id = s.puzzle_id
  where s.user_id = (select id from target)
    and p.date >= ((now() at time zone 'utc')::date - 365)
  group by p.date
),

active_days as (
  select count(distinct p.date) as total
  from public.solves s
  join public.puzzles p on p.id = s.puzzle_id
  where s.user_id = (select id from target)
),

-- Per-pack rows plus the combined row, which has pack_id IS NULL.
streak_rows as (
  select pk.slug as pack_slug, st.current_streak, st.longest_streak, st.last_played_date
  from public.streaks st
  left join public.packs pk on pk.id = st.pack_id
  where st.user_id = (select id from target)
),

-- Rank by total wins, in one pass with a window function rather than by
-- sorting every user in application memory.
--
-- ponytail: this aggregates the whole solves table on each profile view.
-- Fine into the tens of thousands of users; past that, make `totals` a
-- materialized view refreshed on a schedule and rank against that. The
-- function signature does not change.
totals as (
  select s.user_id, count(*) as solved
  from public.solves s
  where s.won
  group by s.user_id
),
ranked as (
  select
    t.user_id,
    t.solved,
    rank() over (order by t.solved desc) as position,
    count(*) over ()                     as population
  from totals t
),
me as (
  select r.position, r.population, r.solved
  from ranked r
  where r.user_id = (select id from target)
),

badge_rows as (
  select b.slug, b.name, b.description, b.icon_url, ub.earned_at
  from public.user_badges ub
  join public.badges b on b.id = ub.badge_id
  where ub.user_id = (select id from target)
  order by ub.earned_at desc
),

-- The heatmap's top shade means "played every live pack that day". Before
-- launch nothing is live, so fall back to the total pack count rather than
-- dividing by zero and painting a single pack as a full day.
live_packs as (
  select coalesce(nullif(count(*) filter (where p.is_live), 0), count(*)) as n
  from public.packs p
)

select case
  when not exists (select 1 from target) then null::jsonb
  else jsonb_build_object(
    -- Deliberately NOT `to_jsonb(target)`: that would ship the user id, and
    -- would silently start shipping any column added to users later.
    'profile', jsonb_build_object(
      'username',   (select t.username   from target t),
      'avatarUrl',  (select t.avatar_url from target t),
      'bio',        (select t.bio        from target t),
      'joinedAt',   (select t.created_at from target t)
    ),
    'packs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', pt.slug, 'name', pt.name, 'solved', pt.solved, 'played', pt.played
      ))
      from pack_totals pt
    ), '[]'::jsonb),
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('day', da.day, 'packs', da.packs))
      from day_activity da
    ), '[]'::jsonb),
    'streaks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'packSlug',       sr.pack_slug,
        'currentStreak',  sr.current_streak,
        'longestStreak',  sr.longest_streak,
        'lastPlayedDate', sr.last_played_date
      ))
      from streak_rows sr
    ), '[]'::jsonb),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', br.slug, 'name', br.name, 'description', br.description,
        'iconUrl', br.icon_url, 'earnedAt', br.earned_at
      ))
      from badge_rows br
    ), '[]'::jsonb),
    'totalActiveDays', (select ad.total from active_days ad),
    'totalSolved',     coalesce((select m.solved from me m), 0),
    'rank',            (select m.position from me m),
    'rankedPlayers',   coalesce((select m.population from me m), 0),
    'livePackCount',   (select lp.n from live_packs lp)
  )
end;
$$;

/**
 * One page of a profile's recent activity, newest first.
 *
 * Returns pack, game day, guesses used and won/lost — never the answer, and
 * never the puzzle id that would let a caller look one up.
 */
create or replace function public.profile_activity(
  p_username text,
  p_limit    int default 20,
  p_offset   int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with target as (
  select u.id
  from public.users u
  where lower(u.username) = lower(p_username)
  limit 1
),
page as (
  select
    pk.slug as pack_slug,
    pk.name as pack_name,
    p.date  as day,
    s.guesses_used,
    s.won,
    s.solved_at
  from public.solves s
  join public.puzzles p  on p.id = s.puzzle_id
  join public.packs   pk on pk.id = p.pack_id
  where s.user_id = (select id from target)
  order by s.solved_at desc, s.id desc
  -- Clamp the page size so a crafted request cannot ask for the whole table.
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0))
)
select coalesce((
  select jsonb_agg(jsonb_build_object(
    'packSlug',    pg.pack_slug,
    'packName',    pg.pack_name,
    'day',         pg.day,
    'guessesUsed', pg.guesses_used,
    'won',         pg.won,
    'solvedAt',    pg.solved_at
  ))
  from page pg
), '[]'::jsonb);
$$;

-- These run as their owner, so keep them off PUBLIC and hand them only to the
-- two roles PostgREST authenticates as.
revoke execute on function public.profile_summary(text)            from public;
revoke execute on function public.profile_activity(text, int, int) from public;

grant execute on function public.profile_summary(text)            to anon, authenticated;
grant execute on function public.profile_activity(text, int, int) to anon, authenticated;
