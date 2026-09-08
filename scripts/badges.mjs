// Sync the badge catalogue and back-fill awards against existing data.
//
//   npm run badges            # sync catalogue + award anyone who qualifies
//   npm run badges -- --dry   # report what would be awarded, change nothing
//
// Run this after adding a rule to src/lib/badges/rules.ts, and once after
// deploying the badge system so people who played before it existed get what
// they already earned.
//
// Safe to run repeatedly: `user_badges` is keyed on (user_id, badge_id) and
// every insert ignores duplicates, so nobody is ever awarded the same badge
// twice and `earned_at` on an existing badge is never overwritten.
import { createClient } from "@supabase/supabase-js";

import { badgesToAward, BADGE_RULES, earnedBadgeSlugs } from "../src/lib/badges/rules.ts";

const dryRun = process.argv.includes("--dry");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes("placeholder") || serviceKey.includes("placeholder")) {
  console.error("Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// 1. Catalogue. The rule list is the single source of truth; this mirrors it
//    into the badges table so user_badges has something to reference.
if (!dryRun) {
  const { error } = await supabase.from("badges").upsert(
    BADGE_RULES.map((rule) => ({
      slug: rule.slug,
      name: rule.name,
      description: rule.description,
    })),
    { onConflict: "slug" },
  );
  if (error) {
    console.error(`Could not sync the badge catalogue: ${error.message}`);
    process.exit(1);
  }
}

const { data: catalogueRows, error: catalogueError } = await supabase
  .from("badges")
  .select("id, slug");

if (catalogueError) {
  console.error(`Could not read the badge catalogue: ${catalogueError.message}`);
  process.exit(1);
}

const badgeIdBySlug = new Map((catalogueRows ?? []).map((row) => [row.slug, row.id]));
console.log(`Catalogue: ${BADGE_RULES.length} rules, ${badgeIdBySlug.size} rows in badges.`);

// 2. Everyone who has ever recorded a solve. Users with no solves cannot
//    qualify for anything, so there is no reason to walk the whole users table.
const { data: users, error: usersError } = await supabase
  .from("users")
  .select("id, username");

if (usersError) {
  console.error(`Could not list users: ${usersError.message}`);
  process.exit(1);
}

let awardedTotal = 0;
let alreadyHeldTotal = 0;
const perUser = [];

for (const user of users ?? []) {
  const { data: context, error: contextError } = await supabase.rpc("badge_context", {
    p_user_id: user.id,
  });

  if (contextError) {
    console.error(`  ${user.username}: could not build context — ${contextError.message}`);
    continue;
  }

  const qualifies = earnedBadgeSlugs(context);
  if (qualifies.length === 0) continue;

  const { data: held } = await supabase
    .from("user_badges")
    .select("badges!inner(slug)")
    .eq("user_id", user.id);

  const heldSlugs = (held ?? []).map((row) => row.badges.slug);
  // Same decision function the live award path uses, so the two cannot drift.
  const missing = badgesToAward(context, heldSlugs);

  alreadyHeldTotal += qualifies.length - missing.length;
  if (missing.length === 0) continue;

  perUser.push({ username: user.username, missing });
  awardedTotal += missing.length;

  if (dryRun) continue;

  const rows = missing
    .map((slug) => badgeIdBySlug.get(slug))
    .filter(Boolean)
    .map((badgeId) => ({ user_id: user.id, badge_id: badgeId }));

  const { error } = await supabase
    .from("user_badges")
    .upsert(rows, { onConflict: "user_id,badge_id", ignoreDuplicates: true });

  if (error) console.error(`  ${user.username}: award failed — ${error.message}`);
}

for (const { username, missing } of perUser) {
  console.log(`  ${username}: ${missing.join(", ")}`);
}

console.log(
  dryRun
    ? `Dry run: would award ${awardedTotal} badge(s); ${alreadyHeldTotal} already held.`
    : `Awarded ${awardedTotal} badge(s); ${alreadyHeldTotal} already held and left alone.`,
);
