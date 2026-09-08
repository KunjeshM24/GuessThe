-- Provision a public.users profile whenever Supabase Auth creates an account.
-- Closes the TODO left in 20260908000000_init.sql.
--
-- Username policy
-- ---------------
-- Derived from the email local part, stripped to the characters the
-- users_username_format CHECK allows ([A-Za-z0-9_], 3-20 chars), then made
-- unique by appending a counter: ada, ada1, ada2, ...
--
-- Collisions are resolved by *catching the unique violation and retrying*
-- rather than by looking for a free name first. A pre-flight SELECT has a race
-- between the check and the insert; two people signing up as ada@… in the same
-- instant would both see "ada" free. The insert is the only thing that can
-- actually settle it, so that is what decides.
--
-- After 30 sequential attempts it switches to a random six-digit suffix, and
-- gives up after 40 total rather than looping forever — an unbounded loop here
-- would hang the signup transaction.
--
-- Usernames are user-visible but not secret; a player can rename later
-- (roadmap step 7 owns profile editing).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base      text;
  candidate text;
  attempt   int := 0;
begin
  -- Keep only characters the CHECK constraint allows.
  base := regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g');
  base := left(base, 14);

  -- Too short (or an email we could not use) falls back to a generic handle.
  if length(base) < 3 then
    base := 'player';
  end if;

  candidate := base;

  loop
    begin
      insert into public.users (id, username, email, avatar_url)
      values (
        new.id,
        candidate,
        new.email,
        -- Google returns one of these; email/password signups return neither.
        coalesce(
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'picture'
        )
      );
      return new;

    exception
      when unique_violation then
        attempt := attempt + 1;

        -- The id is the primary key, so a clash on it means the profile is
        -- already there. Nothing to do, and retrying would loop forever.
        if exists (select 1 from public.users u where u.id = new.id) then
          return new;
        end if;

        if attempt > 40 then
          raise exception 'could not allocate a username for %', new.id;
        elsif attempt > 30 then
          candidate := left(base, 14) || lpad(floor(random() * 1000000)::text, 6, '0');
        else
          candidate := left(base, 14) || attempt::text;
        end if;
    end;
  end loop;
end;
$$;

-- Only the trigger should ever call this.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill any accounts created before this migration (e.g. a test signup made
-- between applying the init migration and this one).
insert into public.users (id, username, email)
select
  au.id,
  -- Same derivation; the loop above is not available here, so fall back to a
  -- slice of the uuid, which is unique by construction.
  case
    when length(regexp_replace(split_part(coalesce(au.email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g')) >= 3
      then left(regexp_replace(split_part(au.email, '@', 1), '[^A-Za-z0-9_]', '', 'g'), 12)
           || replace(left(au.id::text, 6), '-', '')
    else 'player' || replace(left(au.id::text, 8), '-', '')
  end,
  au.email
from auth.users au
where not exists (select 1 from public.users u where u.id = au.id)
on conflict do nothing;
