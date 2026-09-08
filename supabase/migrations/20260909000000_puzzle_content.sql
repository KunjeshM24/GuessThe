-- Puzzle content columns needed by the engine (roadmap step 2).
--
-- GamePlan.md Section 8 calls the data model a "starting point". Section 5.1
-- requires a fact/blurb on reveal, and colour-coded feedback needs a notion of
-- "close" that is data-driven rather than hard-coded per pack — otherwise the
-- engine stops being pack-agnostic.

alter table public.puzzles
  -- Shown only after the player has won or lost (GamePlan.md Section 5.1).
  add column fact text,

  -- Alternative spellings and names accepted as fully correct. Matched after
  -- the same normalisation applied to the answer, so case and punctuation
  -- variants do not need listing here.
  add column aliases text[] not null default '{}',

  -- Whole-word tokens that earn "close" feedback rather than "wrong" — for
  -- trees this is the genus ('birch', 'betula'); another pack would use
  -- whatever its own near-miss axis is. Pack-agnostic by being pure data.
  add column close_terms text[] not null default '{}';

-- Answers are compared case-insensitively everywhere, so keep them tidy.
alter table public.puzzles
  add constraint puzzles_answer_not_blank check (btrim(answer) <> '');

-- Still no client-readable policy on puzzles, deliberately — see the note in
-- 20260908000000_init.sql. These columns are as secret as `answer` is.
