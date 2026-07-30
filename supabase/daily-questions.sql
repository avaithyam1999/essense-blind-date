-- Daily AI questions: per-user, AI-personalized questions that still feed
-- compute_compatibility(). Run this in the Supabase SQL editor AFTER
-- schema.sql.
--
-- Design (agreed 2026-07-30):
--   * The AI writes a UNIQUE question per user per day (personalized from
--     their own profile), but every question targets a shared trait from
--     trait_bank with a FIXED canonical answer vocabulary. Two users can be
--     asked completely different questions about the same trait and their
--     answers still compare -- scoring needs shared keys, not shared copy.
--   * Each trait is registered in question_defs, so compute_compatibility()
--     picks it up with zero changes to the scoring code. Answers are stored
--     in profiles.questionnaire under the trait's category, exactly like
--     onboarding answers. A trait unanswered by either side is excluded,
--     never penalized (same skip semantics as onboarding).
--   * Generation happens in the daily-question edge function (see
--     supabase/functions/daily-question/), which is the only writer of
--     daily_prompts. Clients read their own prompts and answer via the
--     answer_daily_prompt() RPC below.

-- ---------------------------------------------------------------------------
-- trait_bank: the dimensions the AI is allowed to ask about. `options` /
-- `scale_labels` are the canonical answer schema (values must never change
-- once users have answered -- same rule as lib/questions.ts). `default_*`
-- fields are the non-AI fallback phrasing if generation fails. `ai_brief`
-- tells the generator what the trait means.
-- ---------------------------------------------------------------------------
create table if not exists trait_bank (
  trait_key text primary key,
  category text not null check (category in ('values_lifestyle', 'interests', 'personality')),
  type text not null check (type in ('scale', 'single_choice')),
  options jsonb,          -- single_choice: [{ "value": canonical, "label": default phrasing }]
  scale_labels jsonb,     -- scale: ["low anchor", "high anchor"]
  default_prompt text not null,
  ai_brief text not null,
  created_at timestamptz not null default now()
);

insert into trait_bank (trait_key, category, type, options, scale_labels, default_prompt, ai_brief) values
  ('punctuality_style', 'personality', 'single_choice',
   '[{"value":"always early","label":"Early — I''m the one waiting"},
     {"value":"right on time","label":"On the dot, every time"},
     {"value":"fashionably late","label":"A stylish few minutes behind"},
     {"value":"time optimist","label":"I genuinely believe I can make it. I cannot."}]',
   null,
   'When you say 7pm, what does that actually mean?',
   'How the person relates to time and punctuality -- early, punctual, late, or chronically optimistic about travel time.'),

  ('tidiness_scale', 'values_lifestyle', 'scale', null,
   '["Comfortably lived-in", "Everything has its place"]',
   'Your space, on an average Tuesday: how does it look?',
   'How tidy and organized the person keeps their living space day to day.'),

  ('risk_appetite', 'personality', 'scale', null,
   '["Play it safe", "Roll the dice"]',
   'When life offers you the uncertain option, how tempted are you?',
   'Appetite for risk and uncertainty in everyday decisions -- not extreme sports specifically, but comfort with the unknown.'),

  ('money_style', 'values_lifestyle', 'single_choice',
   '[{"value":"saver","label":"A saver — future me says thanks"},
     {"value":"spender","label":"Money is for living, and I live"},
     {"value":"generous with others","label":"I''d rather spend it on people I love"},
     {"value":"budgeting in progress","label":"Let''s call it a work in progress"}]',
   null,
   'Be honest: what''s your relationship with money?',
   'The person''s everyday relationship with money -- saving, spending, generosity, or still figuring it out. Keep it light, never judgmental.'),

  ('pet_alignment', 'values_lifestyle', 'single_choice',
   '[{"value":"dog person","label":"Dog person, obviously"},
     {"value":"cat person","label":"Cat person, obviously"},
     {"value":"all animals","label":"If it has fur, feathers or scales, I love it"},
     {"value":"no pets please","label":"I''ll admire your pet from a respectful distance"}]',
   null,
   'A pet walks into your life. What are you hoping it is?',
   'Where the person lands on pets -- dogs, cats, everything, or prefers an animal-free home.'),

  ('family_closeness', 'values_lifestyle', 'scale', null,
   '["We catch up now and then", "We talk basically every day"]',
   'How woven into your week is your family?',
   'How close and in-contact the person is with their family. Be warm and neutral -- distance is not a flaw.'),

  ('texting_style', 'personality', 'single_choice',
   '[{"value":"instant replier","label":"I reply before the second buzz"},
     {"value":"batch replier","label":"Three thoughtful replies a day"},
     {"value":"voice notes","label":"Voice notes. Always voice notes"},
     {"value":"calls over texts","label":"Just call me — it''s faster"}]',
   null,
   'Someone you like texts you. What does your reply rhythm look like?',
   'The person''s communication rhythm over text -- instant, batched, voice notes, or prefers calls.'),

  ('reassurance_style', 'personality', 'scale', null,
   '["Words of reassurance help me", "Steady on my own"]',
   'Early in something good: how much do you need to hear where you stand?',
   'How much explicit reassurance the person wants early in a relationship. Handle gently -- neither end is better.'),

  ('novelty_seeking', 'interests', 'scale', null,
   '["Favorites, forever", "Always chasing something new"]',
   'Your free evening: the beloved usual, or something untried?',
   'Preference for novelty versus beloved favorites in everyday leisure -- food, places, media, routines.'),

  ('competitive_streak', 'personality', 'scale', null,
   '["It''s just a game", "In it to win it"]',
   'Board game night gets serious. Where are you on the board?',
   'How competitive the person gets in games and friendly contests.'),

  ('outdoors_affinity', 'interests', 'scale', null,
   '["Happiest indoors", "Happiest under open sky"]',
   'A free Saturday, perfect weather. Where does your day happen?',
   'How much of the person''s happy place is outdoors versus indoors.'),

  ('celebration_style', 'interests', 'single_choice',
   '[{"value":"big party","label":"The more people, the better"},
     {"value":"small dinner","label":"A small table of favorite people"},
     {"value":"quiet day","label":"Quiet, calm, exactly as I like it"},
     {"value":"spontaneous adventure","label":"Surprise me — let''s go somewhere"}]',
   null,
   'It''s your birthday. What does the good version look like?',
   'How the person prefers to celebrate milestones -- big and social, intimate, quiet, or adventurous.')
on conflict (trait_key) do nothing;

-- Register traits with the scoring engine. skippable = true because a trait
-- only counts when both sides have answered it anyway.
insert into question_defs (key, category, type, skippable)
select trait_key, category, type, true from trait_bank
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- daily_prompts: one AI-personalized question per user per day. Written only
-- by the daily-question edge function (service role); users read their own.
-- ---------------------------------------------------------------------------
create table if not exists daily_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  trait_key text not null references trait_bank (trait_key),
  ask_date date not null default current_date,
  prompt text not null,
  options jsonb,        -- single_choice: [{ "value": canonical, "label": personalized, "quip": reply }]
  scale_labels jsonb,   -- scale: ["low anchor", "high anchor"] (possibly personalized)
  quip text,            -- scale: the matchmaker's reply after answering
  ai_generated boolean not null default false,
  answer jsonb,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, ask_date)
);

create index if not exists daily_prompts_user_date_idx on daily_prompts (user_id, ask_date desc);

alter table daily_prompts enable row level security;

create policy "daily_prompts: read own"
  on daily_prompts for select
  using (auth.uid() = user_id);
-- No insert/update policies for clients on purpose: the edge function writes
-- with the service role, and answers go through answer_daily_prompt() below.

-- ---------------------------------------------------------------------------
-- answer_daily_prompt: validates the answer against the trait's canonical
-- schema, stores it on the prompt row, and merges it into
-- profiles.questionnaire -> <category> -> <trait_key>, where
-- compute_compatibility() will find it.
-- ---------------------------------------------------------------------------
create or replace function answer_daily_prompt(prompt_id uuid, p_answer jsonb)
returns void as $$
declare
  p record;
  t record;
  answer_text text;
  answer_num numeric;
  valid boolean := false;
begin
  select * into p from daily_prompts where id = prompt_id and user_id = auth.uid();
  if p is null then
    raise exception 'prompt not found';
  end if;
  if p.answered_at is not null then
    raise exception 'prompt already answered';
  end if;

  select * into t from trait_bank where trait_key = p.trait_key;

  if t.type = 'scale' then
    if jsonb_typeof(p_answer) = 'number' then
      answer_num := (p_answer #>> '{}')::numeric;
      valid := answer_num = round(answer_num) and answer_num between 1 and 5;
    end if;
  elsif t.type = 'single_choice' then
    if jsonb_typeof(p_answer) = 'string' then
      answer_text := p_answer #>> '{}';
      valid := exists (
        select 1 from jsonb_array_elements(t.options) o
        where o ->> 'value' = answer_text
      );
    end if;
  end if;

  if not valid then
    raise exception 'answer does not match the canonical schema for trait %', p.trait_key;
  end if;

  update daily_prompts
    set answer = p_answer, answered_at = now()
    where id = prompt_id;

  update profiles
    set questionnaire = jsonb_set(
      jsonb_set(
        questionnaire,
        array[t.category],
        coalesce(questionnaire -> t.category, '{}'::jsonb),
        true
      ),
      array[t.category, p.trait_key],
      p_answer,
      true
    ),
    updated_at = now()
    where id = auth.uid();
end;
$$ language plpgsql security definer;
