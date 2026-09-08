# GamePlan.md — Daily Dex

*This document is the shared vision and reference for building this project. It will be provided as context at the start of the build. Refer back to it for any decision about scope, design, or architecture that isn't explicitly spelled out in a given prompt.*

---

## 1. Vision

We're building a daily guessing-game platform — the "Wordle mechanic" (limited guesses, progressive hints, color-coded feedback, streaks, shareable results) applied across multiple themed **niche packs** (Tree of the Day, Object of the Day, and more later), all under one shared account system with a LeetCode-style gamified profile page (activity heatmap, streaks, badges, rank).

This is a real product, not a prototype or demo — it needs to be secure, maintainable, and genuinely production-ready, since it will be exposed to real internet traffic and (eventually) real ad revenue. Favor correctness, simplicity, and security over cleverness at every step. Where a choice isn't specified below, prefer the boring, well-supported option.

---

## 2. Business context (for judgment calls during the build)

- Solo, non-professional-developer-led, AI-assisted build. Optimize for maintainability and clarity over premature scale.
- Goal is modest, real ad income (success = ~$100+/month), not massive scale — don't over-engineer for millions of users.
- Monetization: ads only for v1 (Google AdSense). No subscriptions/paid tiers yet.
- Launch scope: **2 niche packs only** — Tree of the Day, Object of the Day. Everything else is backlog; the architecture should support adding new packs easily later without a rewrite, but do not build extra packs speculatively.
- No paid user acquisition planned — growth relies on SEO (archive pages), shareable result cards, and posting in relevant communities.

---

## 3. Niche packs

| Pack | Status |
|---|---|
| Tree of the Day | Launch (v1) |
| Object of the Day | Launch (v1) |
| Insect of the Day | Backlog |
| Movie of the Day | Backlog |
| Anime of the Day | Backlog |
| Music / Country / Logo of the Day | Backlog, unscoped |

Each pack's puzzle consists of: one answer, an ordered list of progressive hints (easy → hard), and one hero image.

---

## 4. Site & domain structure

- One Next.js codebase, one Postgres database, one shared account/streak/badge system across all packs.
- Each pack is addressable at its own subdomain (e.g. `trees.domain.com`, `objects.domain.com`) via wildcard DNS + middleware routing on hostname; the bare domain serves as the hub homepage linking to every live pack.
- A pack may later be promoted to a fully separate domain without changing the underlying codebase.

---

## 5. Core features — v1 scope

### 5.1 Gameplay (per pack)
- Daily puzzle, deterministic by date + pack — identical puzzle for every visitor on a given day
- Guess input with progressive hint reveal
- Color-coded feedback per guess, logic appropriate to the pack
- Win/lose state with answer reveal + a short fact/blurb about the answer
- Shareable result card: auto-generated emoji-grid-style text summary, one-tap copy to clipboard
- "How to play" modal, pack-specific
- Archive page listing past puzzles + answers, with per-puzzle SEO metadata/title tags

### 5.2 Accounts & streaks
- Playable without an account — streak tracked via cookie/localStorage
- Optional account (email + one OAuth provider) to sync streaks across devices and unlock the profile page
- Per-pack streak (current + longest) plus a combined all-packs streak
- Anonymous streak data migrates into the account on signup

### 5.3 Profile page (LeetCode-style)
- Header: username, avatar, join date, optional user-editable bio
- Stats breakdown: puzzles solved per pack (packs replace "Easy/Medium/Hard" as the breakdown axis)
- Activity heatmap: past 12 months, one cell per day, shaded by how many packs were played that day
- Streak stats: current streak, longest streak, total active days
- Rank/percentile: simple ranking against all users by total puzzles solved (refine formula later once real usage data exists)
- Badge grid with earned badges, most recent highlighted. Starter badges:
  - Streak badges: 7-day, 30-day, 100-day, 365-day
  - Pack-mastery badges: e.g. "Tree Whisperer" (10 tree puzzles solved), one per pack
  - "Completionist" — played every live pack in the same week
  - First-solve badge
- Recent activity feed: last N solved puzzles, pack + date + result
- Public profile URL (e.g. `/u/username`)

### 5.4 Cross-pack systems
- Leaderboard: daily and all-time, filterable per pack and combined
- Badge/streak/heatmap logic lives in one shared service reading from a single solves/events table — every pack's solve event feeds the same system, no per-pack duplication

### 5.5 Platform & non-functional requirements
- Basic analytics (Plausible or GA4)
- Google AdSense integration + required privacy policy page
- Responsive down to mobile; visible keyboard focus; respects reduced-motion
- **Security requirements (non-negotiable, apply throughout the build):**
  - All user input (guesses, bio text, usernames) validated and sanitized server-side, never trusted from the client
  - Auth sessions handled via a well-supported library (Supabase Auth or NextAuth) — no hand-rolled session/token logic
  - Passwords never stored in plaintext; rely on the auth library's hashing
  - Environment variables/secrets never committed to the repo or exposed to the client bundle; use `.env.local` + a `.env.example` template
  - Rate limiting on write endpoints (guess submission, account creation, badge-award triggers) to prevent abuse/spam
  - Daily puzzle answers must never be retrievable from the client before a user has solved or failed that day's puzzle (validate guesses server-side, don't ship the answer in client-side JS/JSON)
  - SQL access via parameterized queries/an ORM, never raw string-concatenated SQL
  - CSRF/XSS-standard protections via the framework defaults — don't disable them

---

## 6. Design system

Concept: a **field-journal / specimen-card** aesthetic for gameplay pages, and a **clean stats-dashboard** treatment for the profile page.

### Color — core palette

| Token | Hex | Use |
|---|---|---|
| `ink` | `#233B37` | Primary text, headers |
| `parchment` | `#EDE4D3` | Page background |
| `parchment-dark` | `#DED0B5` | Card backgrounds, panel fills |
| `ochre` | `#C98A2C` | Primary accent — stamps, active states, streak flame |
| `moss` | `#4B6E52` | Correct-guess feedback, success states, heatmap "played" cells |
| `brick` | `#9E4331` | Incorrect-guess feedback, error states |
| `ink-faint` | `#6F7C77` | Secondary text, metadata |

Heatmap intensity uses 4 shades from `parchment-dark` (no activity) up to full `moss` (played every live pack that day) — no separate color scale.

### Type
- Display/headlines: a slab serif with character (e.g. Fraunces)
- Body/UI/data: a humanist sans (e.g. Work Sans or Inter) — the profile page leans almost entirely on the sans family, reserving the serif for the page title only

### Layout
- Gameplay pages: index-card/specimen-card metaphor, catalog-tab category picker, stacked ticket-stub guess history
- Profile page: clean grid dashboard — header band, then stats+heatmap alongside badges+recent activity (two-column desktop, stacked mobile)
- One deliberate motion moment on the profile page: badge cards flip/reveal when newly earned; otherwise static

---

## 7. Tech stack

- **Frontend:** Next.js (App Router), Tailwind CSS themed with the tokens above
- **Data:** Postgres via Supabase or Neon
- **Auth:** Supabase Auth or NextAuth
- **Hosting:** Vercel
- **Analytics:** Plausible or GA4
- **Ads:** Google AdSense

---

## 8. Data model (starting point)

```
packs            (id, slug, name, description, is_live)
puzzles          (id, pack_id, date, answer, hints: jsonb, hero_image_url)
users            (id, username, email, avatar_url, bio, created_at)
solves           (id, user_id, puzzle_id, guesses_used, solved_at, won: bool)
streaks          (user_id, pack_id NULLABLE for combined, current_streak, longest_streak, last_played_date)
badges           (id, slug, name, description, icon_url)
user_badges      (user_id, badge_id, earned_at)
```

`solves` is the single source-of-truth event table feeding the heatmap, streaks, badges, leaderboard, and recent-activity feed.

---

## 9. Roadmap (high-level — actual build prompts will be provided one at a time)

1. Project scaffold: Next.js + Tailwind theme + database schema + env/config setup
2. Puzzle engine core, built against Tree of the Day with seed data
3. Shareable result card
4. Anonymous streak tracking
5. Accounts/auth + anonymous-to-account streak migration
6. Second pack (Object of the Day) — confirms engine is pack-agnostic
7. Profile page (heatmap, stats, streaks, rank)
8. Badge logic as a shared service
9. Leaderboard
10. Hub homepage + subdomain routing
11. Archive pages + SEO metadata
12. Ads, analytics, security/accessibility polish pass

---

## 10. Open decisions to confirm early

- Final project/brand name and domain
- Supabase vs. Neon for the database
- Email/password vs. OAuth-only auth, and which OAuth provider
- Exact percentile/rank formula for the profile page (start simple, refine later)
