-- Badges and the leaderboard (GamePlan.md Sections 5.3 and 5.4, roadmap
-- steps 8 and 9).

-- Ranking today's board reads every solve for today's puzzles.
create index if not exists solves_solved_at_idx on public.solves (solved_at desc);

/**
 * Every fact the badge rules need about one player, in one round trip.
 *
 * Called only by server code holding the service-role key — the live award
 * path (after a solve is recorded) and the backfill script. It takes a user id
 * rather than reading auth.uid() because the backfill evaluates every user,
 * and it is granted to service_role alone so a browser cannot reach it and
 * enumerate other people's stats.
 *
 * Adding a fact here plus a field on `BadgeContext` is all a future badge rule
 * needs; see src/lib/badges/rules.ts.
 */
create or replace function public.badge_context(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with wins as (
  select pk.slug, count(*) as n
  from public.solves s
  join public.puzzles p  on p.id = s.puzzle_id
  join public.packs   pk on pk.id = p.pack_id
  where s.user_id = p_user_id and s.won
  group by pk.slug
),

-- Monday-based week, matching date_trunc's own definition and the heatmap.
-- "Played" here means attempted, won or not, per GamePlan.md Section 5.3.
this_week as (
  select distinct pk.slug
  from public.solves s
  join public.puzzles p  on p.id = s.puzzle_id
  join public.packs   pk on pk.id = p.pack_id
  where s.user_id = p_user_id
    and p.date >= date_trunc('week', (now() at time zone 'utc')::date)::date
    and p.date <  date_trunc('week', (now() at time zone 'utc')::date)::date + 7
),

combined as (
  select st.current_streak, st.longest_streak
  from public.streaks st
  where st.user_id = p_user_id and st.pack_id is null
),

-- Before launch nothing is live, so fall back to every pack rather than
-- making "played every live pack" vacuously true.
live as (
  select coalesce(
    nullif(array_agg(p.slug order by p.slug) filter (where p.is_live), '{}'),
    array_agg(p.slug order by p.slug)
  ) as slugs
  from public.packs p
)

select jsonb_build_object(
  'totalSolved',  coalesce((select sum(w.n) from wins w), 0),
  'solvedByPack', coalesce((select jsonb_object_agg(w.slug, w.n) from wins w), '{}'::jsonb),
  'combinedStreak', jsonb_build_object(
    'currentStreak', coalesce((select c.current_streak from combined c), 0),
    'longestStreak', coalesce((select c.longest_streak from combined c), 0)
  ),
  'packsPlayedThisWeek', coalesce((select jsonb_agg(t.slug) from this_week t), '[]'::jsonb),
  'livePackSlugs', coalesce((select to_jsonb(l.slugs) from live l), '[]'::jsonb)
);
$$;

revoke execute on function public.badge_context(uuid) from public, anon, authenticated;
grant  execute on function public.badge_context(uuid) to service_role;

/**
 * Leaderboard (GamePlan.md Section 5.4). Four shapes:
 *
 *   all-time + pack       most wins in that pack
 *   all-time + combined   most wins overall
 *   daily    + pack       today's puzzle: fewest guesses, then earliest finish
 *   daily    + combined   most packs solved today, then fewest total guesses,
 *                         then earliest finish
 *
 * `security definer` because ranking is inherently cross-user and every table
 * involved is own-row-only under RLS. It returns username and avatar and
 * nothing else — the same privacy rule as the profile page. No email, no ids.
 *
 * Ordering and limiting happen in the database; nothing sorts a user list in
 * application memory.
 *
 * ponytail: the all-time branches aggregate the whole solves table per call.
 * Fine into the tens of thousands of users, and the daily leaderboard (the
 * one people actually refresh) is cheap and cached in the app. Past that,
 * materialise the all-time totals on a schedule — the signature is unchanged.
 */
create or replace function public.leaderboard(
  p_scope text default 'all-time',
  p_pack  text default null,
  p_limit int  default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit  int  := greatest(1, least(coalesce(p_limit, 50), 100));
  v_today  date := (now() at time zone 'utc')::date;
  v_result jsonb;
begin
  if p_scope is null or p_scope not in ('daily', 'all-time') then
    return '[]'::jsonb;
  end if;

  -- A pack filter naming a pack that does not exist yields an empty board
  -- rather than silently falling through to "combined".
  if p_pack is not null and not exists (select 1 from public.packs p where p.slug = p_pack) then
    return '[]'::jsonb;
  end if;

  if p_scope = 'daily' then
    select coalesce(jsonb_agg(row_to_json(r) order by r.rank), '[]'::jsonb)
    into v_result
    from (
      select
        row_number() over (
          order by count(*) desc, sum(s.guesses_used) asc, max(s.solved_at) asc
        )                        as rank,
        u.username               as "username",
        u.avatar_url             as "avatarUrl",
        count(*)::int            as "solved",
        sum(s.guesses_used)::int as "guesses"
      from public.solves s
      join public.puzzles p  on p.id = s.puzzle_id
      join public.packs   pk on pk.id = p.pack_id
      join public.users   u  on u.id = s.user_id
      where s.won
        and p.date = v_today
        and (p_pack is null or pk.slug = p_pack)
      group by u.id, u.username, u.avatar_url
      -- Must repeat the window's ordering: LIMIT without ORDER BY would take
      -- an arbitrary slice, not the top of the board.
      order by count(*) desc, sum(s.guesses_used) asc, max(s.solved_at) asc
      limit v_limit
    ) r;

  else
    select coalesce(jsonb_agg(row_to_json(r) order by r.rank), '[]'::jsonb)
    into v_result
    from (
      select
        row_number() over (order by count(*) desc, min(s.solved_at) asc) as rank,
        u.username    as "username",
        u.avatar_url  as "avatarUrl",
        count(*)::int as "solved",
        null::int     as "guesses"
      from public.solves s
      join public.puzzles p  on p.id = s.puzzle_id
      join public.packs   pk on pk.id = p.pack_id
      join public.users   u  on u.id = s.user_id
      where s.won
        and (p_pack is null or pk.slug = p_pack)
      group by u.id, u.username, u.avatar_url
      order by count(*) desc, min(s.solved_at) asc
      limit v_limit
    ) r;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.leaderboard(text, text, int) from public;
grant  execute on function public.leaderboard(text, text, int) to anon, authenticated;
