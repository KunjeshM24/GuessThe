// Seed a pack's puzzles from content/packs/<slug>.json, dated sequentially
// from today (UTC).
//
//   npm run seed            # trees
//   npm run seed -- objects
//
// Idempotent: re-running overwrites the same (pack_id, date) rows rather than
// duplicating them, so it is safe to run again after editing the content file.
// Uses the service-role key because `puzzles` has no client-writable policy.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? "trees";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes("placeholder") || serviceKey.includes("placeholder")) {
  console.error("Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const content = JSON.parse(readFileSync(join(root, "content", "packs", `${slug}.json`), "utf8"));
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: pack, error: packError } = await supabase
  .from("packs")
  .select("id, name, is_live")
  .eq("slug", slug)
  .maybeSingle();

if (packError) {
  console.error(`Could not read packs: ${packError.message}`);
  process.exit(1);
}
if (!pack) {
  console.error(`No pack with slug "${slug}". Apply supabase/migrations/ first.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const addDays = (date, n) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const rows = content.puzzles.map((puzzle, i) => ({
  pack_id: pack.id,
  date: addDays(today, i),
  answer: puzzle.answer,
  aliases: puzzle.aliases,
  close_terms: puzzle.closeTerms,
  hints: puzzle.hints,
  fact: puzzle.fact,
  hero_image_url: null,
}));

const { error } = await supabase.from("puzzles").upsert(rows, { onConflict: "pack_id,date" });

if (error) {
  console.error(`Seed failed: ${error.message}`);
  process.exit(1);
}

console.log(
  `Seeded ${rows.length} puzzles for ${pack.name}: ${rows[0].date} to ${rows.at(-1).date}.`,
);
if (!pack.is_live) {
  console.log(`Pack is_live is false — review the content, then flip it to publish.`);
}
