// Populates a Supabase project with the 20 sample profiles from the
// prototyping phase (supabase/sample-profiles.json), each as a real
// auth.users + profiles row with onboarding_complete = true. Useful for
// testing build_queue()'s exposure-cap/reserved-slot logic against a real
// pool instead of manually signing up 20 times.
//
// Requires the SERVICE ROLE key (not the anon key) because it uses the
// admin auth API. Never ship the service role key in the app itself.
//
// Usage:
//   SUPABASE_URL=https://your-project.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
//   node scripts/seed.js

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SEED_PASSWORD = "seed-password-123!";

async function main() {
  const raw = fs.readFileSync(path.join(__dirname, "..", "supabase", "sample-profiles.json"), "utf8");
  const { profiles } = JSON.parse(raw);

  for (const p of profiles) {
    const email = `${p.id}@seed.blinddate.local`;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
    });

    if (createErr) {
      console.error(`Skipping ${p.name} (${email}): ${createErr.message}`);
      continue;
    }

    const userId = created.user.id;

    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: userId,
      name: p.name,
      age: p.age,
      gender: p.gender,
      seeking: p.seeking,
      city: p.location.city,
      neighborhood: p.location.neighborhood,
      self_description: p.self_description,
      card_teaser: p.card_teaser,
      physical_description: p.physical_description,
      questionnaire: p.questionnaire,
      onboarding_complete: true,
    });

    if (profileErr) {
      console.error(`Profile insert failed for ${p.name}: ${profileErr.message}`);
      continue;
    }

    console.log(`Seeded ${p.name} (${email})`);
  }

  console.log("\nDone. All seed accounts share the password:", SEED_PASSWORD);
  console.log("Sign in as one of them (e.g. p01@seed.blinddate.local) to see the others in your queue.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
