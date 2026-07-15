// Hand-written domain types mirroring supabase/schema.sql. The Supabase
// client itself is NOT parameterized with a generated Database type (see
// lib/supabase.ts) to keep this MVP simple -- these types are applied
// manually at each call site instead. If you install the Supabase CLI
// later you can generate real types with:
//   npx supabase gen types typescript --project-id <ref> > lib/database-types.ts

export type Gender = "man" | "woman" | "nonbinary";

export type RelationshipIntent =
  | "long-term relationship"
  | "long-term, open to short-term"
  | "short-term, open to long-term"
  | "not sure yet, figuring it out";

export type WantsKids = "yes" | "no" | "unsure" | "already have kids, open to more" | "already have kids, done";

export type ConflictStyle =
  | "direct and immediate"
  | "needs time to process first"
  | "collaborative problem-solver"
  | "avoids conflict, works on it";

export interface ValuesLifestyleAnswers {
  relationship_intent: RelationshipIntent;
  wants_kids: WantsKids;
  career_centrality: number; // 1-5
  conflict_style: ConflictStyle;
  substance_use: string;
  chronotype: "early bird" | "night owl" | "somewhere in between";
  routine_vs_spontaneity: number; // 1-5
  religion_importance?: number; // 1-5, skippable
  politics_importance?: number; // 1-5, skippable
}

export interface InterestAnswers {
  top_hobbies: string[];
  social_battery: number; // 1-5
  travel_frequency: string;
  fitness_level: string;
  food_style: string;
  music_taste?: string; // skippable, flavor only
  media_taste?: string; // skippable, flavor only
}

export interface PersonalityAnswers {
  social_energy_scale: number; // 1-5
  planner_vs_spontaneous: number; // 1-5
  emotional_expressiveness: number; // 1-5
  humor_style: string;
  love_language: string;
  recharge_style: string;
  communication_style: string;
}

export interface QuestionnaireAnswers {
  values_lifestyle: ValuesLifestyleAnswers;
  interests: InterestAnswers;
  personality: PersonalityAnswers;
}

export interface PhysicalDescription {
  favorite_feature: string;
  style_and_vibe: string;
  build?: string; // optional / skippable
  height?: string; // optional / skippable
  hair: string;
  signature_detail?: string; // optional / skippable
  energy_others_notice: string;
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  seeking: Gender[];
  city: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  self_description: string;
  card_teaser: string;
  physical_description: PhysicalDescription;
  questionnaire: QuestionnaireAnswers;
  created_at: string;
}

export interface QueueCandidate {
  candidate_id: string;
  age: number;
  neighborhood: string;
  city: string;
  self_description: string;
  card_teaser: string;
  top_hobbies: string[];
  compatibility_score: number;
}

export interface Match {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
}
