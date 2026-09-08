// Smoke test: are the Supabase env vars real, and has the migration been run?
// Reads live packs with the anon key, i.e. exactly what the browser can see.
//
//   npm run check:db
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key || url.includes("placeholder")) {
  console.error("Fill NEXT_PUBLIC_SUPABASE_* in .env.local first (see .env.example).");
  process.exit(1);
}

const { data, error } = await createClient(url, key).from("packs").select("slug, is_live");

if (error) {
  console.error(`Failed: ${error.message}`);
  console.error("If the table is missing, apply supabase/migrations/ (see README).");
  process.exit(1);
}

// Zero rows is a pass: the packs seeded by the migration are is_live=false
// until the engine ships, and RLS only exposes live packs.
console.log(`Connected. ${data.length} live pack(s) visible to the client.`);
