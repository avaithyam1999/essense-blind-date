-- Blind Date MVP schema
-- Run this in the Supabase SQL editor for a fresh project (Database > SQL Editor > New query).
-- Mirrors the design decisions from the concept phase:
--   * No photos anywhere.
--   * Curated (not open-browse) queue, pre-filtered by gender/seeking + city,
--     ranked by a blended compatibility score, with exposure caps and
--     reserved slots so attention doesn't concentrate on a few profiles.
--   * Name and physical_description are hidden until a mutual match exists.
--   * Gender/orientation is a hard pre-filter, never part of the score --
--     compute_compatibility() returns 0 for a mismatch as a safety net.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- question_defs: drives compute_compatibility() generically so the scoring
-- logic and the question bank (see lib/questions.ts) can't drift apart
-- silently. Keep this in sync with lib/questions.ts by hand for now.
-- ---------------------------------------------------------------------------
create table if not exists question_defs (
  key text primary key,
  category text not null check (category in ('values_lifestyle', 'interests', 'personality')),
  type text not null check (type in ('scale', 'single_choice', 'multi_choice', 'text')),
  skippable boolean not null default false
);

insert into question_defs (key, category, type, skippable) values
  ('relationship_intent', 'values_lifestyle', 'single_choice', false),
  ('wants_kids', 'values_lifestyle', 'single_choice', false),
  ('career_centrality', 'values_lifestyle', 'scale', false),
  ('conflict_style', 'values_lifestyle', 'single_choice', false),
  ('substance_use', 'values_lifestyle', 'single_choice', false),
  ('chronotype', 'values_lifestyle', 'single_choice', false),
  ('routine_vs_spontaneity', 'values_lifestyle', 'scale', false),
  ('religion_importance', 'values_lifestyle', 'scale', true),
  ('politics_importance', 'values_lifestyle', 'scale', true),
  ('ideal_weekend', 'values_lifestyle', 'text', true),
  ('top_hobbies', 'interests', 'multi_choice', false),
  ('social_battery', 'interests', 'scale', false),
  ('travel_frequency', 'interests', 'single_choice', false),
  ('fitness_level', 'interests', 'single_choice', false),
  ('food_style', 'interests', 'single_choice', false),
  ('music_taste', 'interests', 'text', true),
  ('media_taste', 'interests', 'text', true),
  ('first_date_activity', 'interests', 'text', true),
  ('hosting_style', 'interests', 'single_choice', false),
  ('social_energy_scale', 'personality', 'scale', false),
  ('planner_vs_spontaneous', 'personality', 'scale', false),
  ('emotional_expressiveness', 'personality', 'scale', false),
  ('humor_style', 'personality', 'single_choice', false),
  ('love_language', 'personality', 'single_choice', false),
  ('recharge_style', 'personality', 'single_choice', false),
  ('communication_style', 'personality', 'single_choice', false),
  ('biggest_pet_peeve', 'personality', 'text', true),
  ('described_by_friends', 'personality', 'text', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- profiles: one row per user, 1:1 with auth.users.
-- physical_description and questionnaire are jsonb -- flexible for an MVP,
-- easy to evolve the question bank without a migration each time.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  age int not null check (age >= 18),
  gender text not null check (gender in ('man', 'woman', 'nonbinary')),
  seeking text[] not null,
  city text not null,
  neighborhood text,
  latitude double precision,
  longitude double precision,
  self_description text not null default '',
  card_teaser text not null default '',
  physical_description jsonb not null default '{}'::jsonb,
  questionnaire jsonb not null default '{}'::jsonb,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_city_idx on profiles (city);

-- ---------------------------------------------------------------------------
-- swipes + matches
-- ---------------------------------------------------------------------------
create table if not exists swipes (
  id uuid primary key default gen_random_uuid(),
  swiper_id uuid not null references profiles (id) on delete cascade,
  target_id uuid not null references profiles (id) on delete cascade,
  direction text not null check (direction in ('like', 'pass')),
  created_at timestamptz not null default now(),
  unique (swiper_id, target_id)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references profiles (id) on delete cascade,
  user_b uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);

create or replace function create_match_on_mutual_like()
returns trigger as $$
declare
  reciprocal_exists boolean;
  a uuid;
  b uuid;
begin
  if new.direction != 'like' then
    return new;
  end if;

  select exists (
    select 1 from swipes
    where swiper_id = new.target_id
      and target_id = new.swiper_id
      and direction = 'like'
  ) into reciprocal_exists;

  if reciprocal_exists then
    a := least(new.swiper_id, new.target_id);
    b := greatest(new.swiper_id, new.target_id);
    insert into matches (user_a, user_b)
    values (a, b)
    on conflict (user_a, user_b) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_swipe_check_match on swipes;
create trigger on_swipe_check_match
  after insert on swipes
  for each row execute function create_match_on_mutual_like();

-- ---------------------------------------------------------------------------
-- queue_exposures: how many distinct users have had a given candidate in
-- their queue today. This is the exposure-cap mechanism from the curation
-- design -- prevents the same high-scoring profiles from being shown to
-- everyone while the rest of the pool goes unseen.
-- ---------------------------------------------------------------------------
create table if not exists queue_exposures (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references profiles (id) on delete cascade,
  shown_to uuid not null references profiles (id) on delete cascade,
  queue_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (candidate_id, shown_to, queue_date)
);

create index if not exists queue_exposures_candidate_date_idx
  on queue_exposures (candidate_id, queue_date);

-- ---------------------------------------------------------------------------
-- compute_compatibility: blended 0-100 score across the three evenly
-- weighted categories, driven by question_defs so scoring logic and the
-- question bank stay in one place. Mirrors lib/compatibility.ts.
--
-- NOTE: this SQL version treats every single_choice mismatch as a hard 0.
-- The TypeScript reference implementation (lib/compatibility.ts) has a small
-- adjacent-answer partial-credit table (e.g. "non-drinker" vs "sober") that
-- isn't replicated here yet -- worth reconciling before this becomes the
-- system of record for scoring.
-- ---------------------------------------------------------------------------
create or replace function compute_compatibility(a_id uuid, b_id uuid)
returns int as $$
declare
  a_gender text;
  b_gender text;
  a_seeking text[];
  b_seeking text[];
  a_q jsonb;
  b_q jsonb;
  cat record;
  q record;
  a_val jsonb;
  b_val jsonb;
  cat_total numeric;
  cat_count int;
  overall_total numeric := 0;
  overall_count int := 0;
  scale_diff numeric;
  a_arr text[];
  b_arr text[];
  overlap_count int;
  union_count int;
begin
  select gender, seeking, questionnaire into a_gender, a_seeking, a_q
    from profiles where id = a_id;
  select gender, seeking, questionnaire into b_gender, b_seeking, b_q
    from profiles where id = b_id;

  -- Hard pre-filter safety net: gender/orientation is enforced upstream in
  -- build_queue(); if a mismatch ever reaches this function, score it 0
  -- rather than let other traits pull the number up.
  if not (b_gender = any(a_seeking) and a_gender = any(b_seeking)) then
    return 0;
  end if;

  for cat in select distinct category from question_defs loop
    cat_total := 0;
    cat_count := 0;

    for q in select key, type from question_defs where category = cat.category loop
      if q.type = 'text' then
        continue; -- v1: free text is card flavor, not scored
      end if;

      a_val := a_q -> cat.category -> q.key;
      b_val := b_q -> cat.category -> q.key;

      if a_val is null or b_val is null or a_val = 'null'::jsonb or b_val = 'null'::jsonb then
        continue; -- skipped by either side -> excluded, not penalized
      end if;

      if q.type = 'scale' then
        -- jsonb has no direct cast to numeric; extract as text first.
        scale_diff := abs((a_val #>> '{}')::numeric - (b_val #>> '{}')::numeric);
        cat_total := cat_total + greatest(0, 100 - scale_diff * 25);
        cat_count := cat_count + 1;
      elsif q.type = 'single_choice' then
        if a_val = b_val then
          cat_total := cat_total + 100;
        else
          cat_total := cat_total + 0;
        end if;
        cat_count := cat_count + 1;
      elsif q.type = 'multi_choice' then
        select array(select jsonb_array_elements_text(a_val)) into a_arr;
        select array(select jsonb_array_elements_text(b_val)) into b_arr;
        select count(*) into overlap_count
          from unnest(a_arr) x where x = any(b_arr);
        select count(distinct x) into union_count
          from unnest(a_arr || b_arr) x;
        if union_count > 0 then
          cat_total := cat_total + (overlap_count::numeric / union_count) * 100;
          cat_count := cat_count + 1;
        end if;
      end if;
    end loop;

    if cat_count > 0 then
      overall_total := overall_total + (cat_total / cat_count);
      overall_count := overall_count + 1;
    end if;
  end loop;

  if overall_count = 0 then
    return 0;
  end if;

  return round(overall_total / overall_count);
end;
$$ language plpgsql stable;

-- ---------------------------------------------------------------------------
-- build_queue: the curated daily deck for a given user.
--   1. Pre-filter: mutual gender/seeking match, same city, not self,
--      not already swiped.
--   2. Rank remaining pool by compute_compatibility.
--   3. Exposure cap: exclude candidates already shown to
--      max_daily_exposure distinct users today.
--   4. Reserve reserved_slots of the queue for low-exposure candidates
--      (fewest total exposures ever) rather than pure top-score, so newer
--      or less "popular" profiles still get seen.
--   5. Record exposures for the selected set.
-- Returns only what a pre-match card should show -- no name, no
-- physical_description.
-- ---------------------------------------------------------------------------
create or replace function build_queue(
  requesting_user uuid,
  queue_size int default 10,
  max_daily_exposure int default 40,
  reserved_slots int default 2
)
returns table (
  candidate_id uuid,
  age int,
  neighborhood text,
  city text,
  self_description text,
  card_teaser text,
  top_hobbies jsonb,
  compatibility_score int
) as $$
#variable_conflict use_column
declare
  req_gender text;
  req_seeking text[];
  req_city text;
  selected_ids uuid[];
  top_n int := greatest(queue_size - reserved_slots, 0);
begin
  select p.gender, p.seeking, p.city into req_gender, req_seeking, req_city
    from profiles p where p.id = requesting_user;

  -- Uses plain CTEs (no temp tables) so repeated calls within the same
  -- session/transaction always see fresh data -- a "CREATE TEMP TABLE IF
  -- NOT EXISTS ... AS SELECT" would silently reuse stale rows on a second
  -- call before the temp table is dropped at commit.
  with pool as (
    select
      p.id,
      compute_compatibility(requesting_user, p.id) as score,
      coalesce((select count(*) from queue_exposures qe where qe.candidate_id = p.id), 0) as total_exposure
    from profiles p
    where p.id != requesting_user
      and p.onboarding_complete = true
      and p.city = req_city
      and p.gender = any(req_seeking)
      and req_gender = any(p.seeking)
      and not exists (
        select 1 from swipes s where s.swiper_id = requesting_user and s.target_id = p.id
      )
      and (
        select count(distinct qe.shown_to) from queue_exposures qe
        where qe.candidate_id = p.id and qe.queue_date = current_date
      ) < max_daily_exposure
  ),
  top_scored as (
    select id from pool order by score desc limit top_n
  ),
  reserved as (
    select id from pool
    where id not in (select id from top_scored)
    order by total_exposure asc, score desc
    limit reserved_slots
  )
  select array_agg(id) into selected_ids
  from (select id from top_scored union select id from reserved) combined;

  if selected_ids is null then
    return; -- nothing eligible for this user right now
  end if;

  insert into queue_exposures (candidate_id, shown_to)
  select unnest(selected_ids), requesting_user
  on conflict (candidate_id, shown_to, queue_date) do nothing;

  return query
  select
    p.id,
    p.age,
    p.neighborhood,
    p.city,
    p.self_description,
    p.card_teaser,
    p.questionnaire -> 'interests' -> 'top_hobbies' as top_hobbies,
    compute_compatibility(requesting_user, p.id) as compatibility_score
  from profiles p
  where p.id = any(selected_ids)
  order by compatibility_score desc;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- get_match_reveal: name + physical_description, only for confirmed matches.
-- This is the sole path by which those fields are ever exposed to another
-- user -- profiles RLS below does not grant direct SELECT on them.
-- ---------------------------------------------------------------------------
create or replace function get_match_reveal(requesting_user uuid, match_id uuid)
returns table (
  other_user_id uuid,
  name text,
  physical_description jsonb
) as $$
declare
  m record;
  other_id uuid;
begin
  select * into m from matches where id = match_id;
  if m is null then
    raise exception 'match not found';
  end if;
  if requesting_user != m.user_a and requesting_user != m.user_b then
    raise exception 'not authorized for this match';
  end if;

  other_id := case when requesting_user = m.user_a then m.user_b else m.user_a end;

  return query
  select p.id, p.name, p.physical_description
  from profiles p
  where p.id = other_id;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- list_matches: names only, for the matches list screen. Physical
-- description still only comes from get_match_reveal when a user opens a
-- specific match.
-- ---------------------------------------------------------------------------
create or replace function list_matches(requesting_user uuid)
returns table (
  match_id uuid,
  other_user_id uuid,
  other_name text,
  matched_at timestamptz
) as $$
begin
  return query
  select
    m.id,
    case when m.user_a = requesting_user then m.user_b else m.user_a end,
    p.name,
    m.created_at
  from matches m
  join profiles p on p.id = (case when m.user_a = requesting_user then m.user_b else m.user_a end)
  where m.user_a = requesting_user or m.user_b = requesting_user
  order by m.created_at desc;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table swipes enable row level security;
alter table matches enable row level security;
alter table queue_exposures enable row level security;

-- Profiles: users can only see/edit their own full row directly. Browsing
-- other users' profiles happens exclusively through build_queue() and
-- get_match_reveal() (both security definer), which return restricted
-- field sets -- not through direct table access.
create policy "profiles: read own row"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: insert own row"
  on profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own row"
  on profiles for update
  using (auth.uid() = id);

create policy "swipes: read own swipes"
  on swipes for select
  using (auth.uid() = swiper_id);

create policy "swipes: insert own swipes"
  on swipes for insert
  with check (auth.uid() = swiper_id);

create policy "matches: read own matches"
  on matches for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "queue_exposures: read own exposure records"
  on queue_exposures for select
  using (auth.uid() = shown_to);
