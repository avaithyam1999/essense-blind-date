# Blind Date — MVP app

A cross-platform (iOS + Android) prototype of the Blind Date concept: no photos anywhere, users swipe on written descriptions, and name + physical description unlock only after a mutual match. Built with Expo/React Native + Supabase.

This is a working MVP scaffold meant for testing on your own device, not an app-store-ready build. See the "What's not done yet" section before showing this to real users.

## Stack

- **App**: Expo (React Native + TypeScript), Expo Router for navigation
- **Backend**: Supabase (Postgres + Auth). All matching/curation logic lives in `supabase/schema.sql` as Postgres functions, not in the app.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project.
2. In the SQL Editor, paste the entire contents of `supabase/schema.sql` and run it. This creates all tables, the compatibility scoring function, the curated-queue function, and row-level security policies.
3. In Project Settings → API, copy your Project URL and `anon` public key.

## 2. Configure the app

```
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from step 1.

## 3. Install and run

```
npm install
npm run start
```

Scan the QR code with the Expo Go app on your phone (iOS or Android), or press `i`/`a` in the terminal to open an iOS Simulator / Android Emulator if you have Xcode/Android Studio installed.

## 4. Try it

1. Sign up with a real or throwaway email (Supabase's default email confirmation may require a real inbox — you can disable "Confirm email" in Authentication → Providers → Email for local testing).
2. Complete onboarding: basic info → questionnaire → self-description → physical description.
3. You'll land on the swipe deck. With only your own account signed up, the queue will be empty — see the seeding step below to populate other profiles to swipe on.

### Populate sample profiles (recommended for testing)

`supabase/sample-profiles.json` has the 20 diverse sample profiles from the prototyping phase. `scripts/seed.js` turns them into real accounts in your Supabase project so you have something to actually swipe on and test the queue/exposure-cap logic against:

```
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
node scripts/seed.js
```

Get the service role key from Project Settings → API (**never** put this in the app itself — it bypasses row-level security). All seeded accounts share the password `seed-password-123!`. Sign in as one of them (e.g. `p01@seed.blinddate.local`) to see the rest of the seeded pool in your queue.

### Daily AI questions (optional, needs an Anthropic API key)

The matchmaker can ask each user one fresh, AI-personalized question per day. The copy is unique per user, but every question maps to a fixed trait schema (`trait_bank`), so answers feed `compute_compatibility()` with no scoring changes — the queue simply gets sharper as people answer.

1. In the SQL Editor, run `supabase/daily-questions.sql` (after `schema.sql`). This creates the trait bank, the per-user `daily_prompts` table, and the `answer_daily_prompt()` RPC — and registers the new traits with the scoring engine.
2. Deploy the generator function and set your Anthropic key ([console.anthropic.com](https://console.anthropic.com)):

```
supabase functions deploy daily-question
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

The app calls the function lazily — the first time a user opens the swipe screen each day, their question is generated (personalized from their own profile) and a banner appears. Without the deployed function the app fails soft: no banner, nothing breaks. If generation fails (no key, model error, invalid output), the user still gets the trait's default hand-written phrasing.

## How the pieces map to the design decisions

- `lib/questions.ts` — the ~28-question onboarding bank (values/lifestyle, interests, personality), with skippable flavor questions.
- `lib/compatibility.ts` — TypeScript reference implementation of the blended compatibility score. The actual scoring used by the app happens server-side in `compute_compatibility()` (schema.sql) so it can't be tampered with client-side; keep both in sync if you change the model.
- `supabase/schema.sql` → `build_queue()` — the curated daily deck: pre-filters by gender/seeking + city, ranks by compatibility, caps how many users can see the same profile per day, and reserves a couple of slots for lower-exposure profiles so attention doesn't concentrate on a few people.
- `supabase/schema.sql` → `get_match_reveal()` — the only path by which a user's name and physical description are ever exposed to someone else, and only after a mutual match.
- `components/SwipeCard.tsx` — the pre-match card (age, neighborhood, bio, interests, teaser, score — deliberately no name/appearance).
- `components/MatchModal.tsx` — the reveal moment.

## What's not done yet

This is a functional skeleton, not a finished product. Known gaps, roughly in the order you'd probably want to tackle them:

- **Location filtering is city-string matching**, not real radius/distance (schema.sql has lat/long columns ready for a proper `earthdistance`/PostGIS-based radius query later).
- **No profile editing UI** after onboarding.
- **No push notifications** for new matches.
- **No date-venue suggestion or day-of outfit prompt** (both were in the concept doc's roadmap, not yet built).
- **No content moderation / reporting / blocking.**
- **No account deletion flow**, no payments/subscription tiers (freemium swipe limits were part of the plan — not implemented).
- **Identity verification / anti-catfishing** was flagged as an open question in the concept phase and still is.
- **IRL safety features** (check-ins, SOS, mandatory public venues) were explicitly deferred in the concept doc — worth revisiting before any real users meet up through this.
- The SQL `compute_compatibility()` doesn't yet implement the "adjacent answer" partial-credit table that `lib/compatibility.ts` has (see the comment in schema.sql) — minor scoring divergence between the two.
- This hasn't been run against a live Supabase instance or a real device/simulator yet — I don't have a Postgres environment or an iOS/Android runtime available where I built this, so treat first-run debugging as expected, especially around RLS policies and the RPC function signatures.
