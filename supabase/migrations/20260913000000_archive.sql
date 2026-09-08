-- Archive pages (GamePlan.md Section 5.1, roadmap step 11).
--
-- This is the first and only place a puzzle answer is deliberately made
-- public, which makes the date filter the most important line in the file.
--
-- The rule is `date < today`, strictly. Today's puzzle is still in play and
-- tomorrow's has not started, so neither may ever appear here — not in a
-- listing, not by asking for a specific date, not through pagination. The
-- comparison lives in SQL rather than in the caller so that no route, no
-- parameter and no future refactor can forget it. `archive.server.ts` applies
-- the same rule again on the way out as a backstop.
--
-- Note on is_live: these functions do NOT filter on it. An unlaunched pack's
-- *past* answers are destined to be public SEO content anyway; the only real
-- secret is today's and the future's, and that is what the date filter
-- protects absolutely. Which packs get an archive *page* is a listing decision
-- made by `getVisiblePacks()`, alongside every other listing in the app.

-- The archive lists one pack newest-first, and numbers puzzles by date.
create index if not exists puzzles_pack_date_desc_idx
  on public.puzzles (pack_id, date desc);

/**
 * One page of a pack's past puzzles, newest first, plus the total so the page
 * can paginate.
 *
 * Returns the answer — that is the point of an archive — but only ever for a
 * game day that has already finished.
 */
create or replace function public.archive_entries(
  p_pack   text,
  p_limit  int default 50,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with target_pack as (
  select p.id from public.packs p where p.slug = p_pack limit 1
),
-- Numbered across the whole pack, so a puzzle's number never shifts as more
-- are published. Future puzzles are counted here but filtered out below.
numbered as (
  select
    pz.date,
    pz.answer,
    row_number() over (order by pz.date asc) as number
  from public.puzzles pz
  where pz.pack_id = (select id from target_pack)
),
past as (
  select n.date, n.answer, n.number
  from numbered n
  where n.date < (now() at time zone 'utc')::date
),
page as (
  select p.date, p.answer, p.number
  from past p
  order by p.date desc
  limit  greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
)
select jsonb_build_object(
  'total', (select count(*) from past),
  'entries', coalesce((
    select jsonb_agg(
      jsonb_build_object('date', pg.date, 'answer', pg.answer, 'number', pg.number)
      order by pg.date desc
    )
    from page pg
  ), '[]'::jsonb)
);
$$;

/**
 * A single past puzzle, with its clues, answer and fact.
 *
 * `p_date` arrives from a URL, so it is untrusted. The `date < today` check
 * below is what makes that safe: asking for today, tomorrow or any future day
 * returns NULL, exactly as if the puzzle did not exist.
 */
create or replace function public.archive_entry(p_pack text, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with target_pack as (
  select p.id from public.packs p where p.slug = p_pack limit 1
),
numbered as (
  select
    pz.date,
    pz.answer,
    pz.fact,
    pz.hints,
    row_number() over (order by pz.date asc) as number
  from public.puzzles pz
  where pz.pack_id = (select id from target_pack)
),
target as (
  select n.*
  from numbered n
  where n.date = p_date
    and n.date < (now() at time zone 'utc')::date
  limit 1
),
-- Neighbours for prev/next links, also confined to finished days.
neighbours as (
  select
    (select max(n.date) from numbered n
      where n.date < p_date) as previous_date,
    (select min(n.date) from numbered n
      where n.date > p_date and n.date < (now() at time zone 'utc')::date) as next_date
)
select case
  when not exists (select 1 from target) then null::jsonb
  else jsonb_build_object(
    'date',         (select t.date   from target t),
    'answer',       (select t.answer from target t),
    'fact',         (select t.fact   from target t),
    'hints',        (select t.hints  from target t),
    'number',       (select t.number from target t),
    'previousDate', (select nb.previous_date from neighbours nb),
    'nextDate',     (select nb.next_date     from neighbours nb)
  )
end;
$$;

revoke execute on function public.archive_entries(text, int, int) from public;
revoke execute on function public.archive_entry(text, date)        from public;

grant execute on function public.archive_entries(text, int, int) to anon, authenticated;
grant execute on function public.archive_entry(text, date)        to anon, authenticated;
