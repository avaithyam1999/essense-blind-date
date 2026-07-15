// The onboarding questionnaire, as agreed in the concept phase:
// ~28 questions across three evenly-weighted categories (values_lifestyle,
// interests, personality). A handful are marked skippable so onboarding
// doesn't feel exhausting. Answers here feed lib/compatibility.ts.

export type QuestionType = "scale" | "single_choice" | "multi_choice" | "text";

export interface QuestionDef {
  key: string;
  category: "values_lifestyle" | "interests" | "personality";
  type: QuestionType;
  prompt: string;
  options?: string[]; // for single_choice / multi_choice
  scaleLabels?: [string, string]; // for scale, e.g. ["Routine", "Spontaneous"]
  skippable?: boolean;
  maxSelect?: number; // for multi_choice, e.g. top 3 hobbies
}

export const QUESTIONS: QuestionDef[] = [
  // --- Values & lifestyle (10) ---
  {
    key: "relationship_intent",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "What are you looking for right now?",
    options: [
      "long-term relationship",
      "long-term, open to short-term",
      "short-term, open to long-term",
      "not sure yet, figuring it out",
    ],
  },
  {
    key: "wants_kids",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "Do you want kids someday?",
    options: ["yes", "no", "unsure", "already have kids, open to more", "already have kids, done"],
  },
  {
    key: "career_centrality",
    category: "values_lifestyle",
    type: "scale",
    prompt: "How central is your career/ambition to your life right now?",
    scaleLabels: ["Not very", "Extremely"],
  },
  {
    key: "conflict_style",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "How do you handle conflict in relationships?",
    options: [
      "direct and immediate",
      "needs time to process first",
      "collaborative problem-solver",
      "avoids conflict, works on it",
    ],
  },
  {
    key: "substance_use",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "Which best describes you?",
    options: ["non-drinker", "social drinker", "regular drinker", "420-friendly", "sober"],
  },
  {
    key: "chronotype",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "Early bird or night owl?",
    options: ["early bird", "night owl", "somewhere in between"],
  },
  {
    key: "routine_vs_spontaneity",
    category: "values_lifestyle",
    type: "scale",
    prompt: "Routine or spontaneity?",
    scaleLabels: ["Routine", "Spontaneous"],
  },
  {
    key: "religion_importance",
    category: "values_lifestyle",
    type: "scale",
    prompt: "How important is shared religion/spirituality in a partner?",
    scaleLabels: ["Not important", "Very important"],
    skippable: true,
  },
  {
    key: "politics_importance",
    category: "values_lifestyle",
    type: "scale",
    prompt: "How important is shared political alignment in a partner?",
    scaleLabels: ["Not important", "Very important"],
    skippable: true,
  },
  {
    key: "ideal_weekend",
    category: "values_lifestyle",
    type: "text",
    prompt: "Describe your ideal weekend.",
    skippable: true,
  },

  // --- Interests & activities (9) ---
  {
    key: "top_hobbies",
    category: "interests",
    type: "multi_choice",
    prompt: "Pick your top 3 hobbies.",
    maxSelect: 3,
    options: [
      "hiking", "cooking", "reading", "gaming", "live music", "travel", "fitness",
      "art & museums", "board games", "dancing", "photography", "gardening",
      "volunteering", "sports", "writing", "crafting",
    ],
  },
  {
    key: "social_battery",
    category: "interests",
    type: "scale",
    prompt: "Homebody or extrovert?",
    scaleLabels: ["Homebody", "Extrovert"],
  },
  {
    key: "travel_frequency",
    category: "interests",
    type: "single_choice",
    prompt: "How often do you travel?",
    options: ["rarely travels", "few times a year", "monthly if possible", "constantly on the move"],
  },
  {
    key: "fitness_level",
    category: "interests",
    type: "single_choice",
    prompt: "How active are you?",
    options: ["not really into it", "casually active", "regular gym-goer", "highly active/athlete"],
  },
  {
    key: "food_style",
    category: "interests",
    type: "single_choice",
    prompt: "How would you describe your food style?",
    options: ["adventurous eater", "comfort food loyalist", "health-conscious", "foodie/loves fine dining"],
  },
  {
    key: "music_taste",
    category: "interests",
    type: "text",
    prompt: "What's on your playlist lately?",
    skippable: true,
  },
  {
    key: "media_taste",
    category: "interests",
    type: "text",
    prompt: "Favorite books, movies, or shows?",
    skippable: true,
  },
  {
    key: "first_date_activity",
    category: "interests",
    type: "text",
    prompt: "Describe a first date you'd actually enjoy.",
    skippable: true,
  },
  {
    key: "hosting_style",
    category: "interests",
    type: "single_choice",
    prompt: "At a party, are you more likely to be...",
    options: ["hosting it", "the last one to leave", "there for an hour, then gone", "not there"],
  },

  // --- Personality (9) ---
  {
    key: "social_energy_scale",
    category: "personality",
    type: "scale",
    prompt: "Are you energized by people, or by solitude?",
    scaleLabels: ["Solitude", "People"],
  },
  {
    key: "planner_vs_spontaneous",
    category: "personality",
    type: "scale",
    prompt: "Planner or spontaneous?",
    scaleLabels: ["Planner", "Spontaneous"],
  },
  {
    key: "emotional_expressiveness",
    category: "personality",
    type: "scale",
    prompt: "How openly do you express emotions?",
    scaleLabels: ["Reserved", "Very open"],
  },
  {
    key: "humor_style",
    category: "personality",
    type: "single_choice",
    prompt: "What's your humor style?",
    options: ["dry/sarcastic", "silly/goofy", "witty/quick", "dark humor", "punny", "observational"],
  },
  {
    key: "love_language",
    category: "personality",
    type: "single_choice",
    prompt: "How do you like to show and receive affection?",
    options: ["words of affirmation", "quality time", "acts of service", "physical touch", "gifts"],
  },
  {
    key: "recharge_style",
    category: "personality",
    type: "single_choice",
    prompt: "How do you recharge after a long week?",
    options: ["alone time", "time with close friends", "physical activity", "creative outlets"],
  },
  {
    key: "communication_style",
    category: "personality",
    type: "single_choice",
    prompt: "How would you describe your communication style?",
    options: ["direct", "gentle/diplomatic", "needs processing time", "very expressive"],
  },
  {
    key: "biggest_pet_peeve",
    category: "personality",
    type: "text",
    prompt: "What's a small thing that instantly annoys you?",
    skippable: true,
  },
  {
    key: "described_by_friends",
    category: "personality",
    type: "text",
    prompt: "How would your closest friend describe you in one sentence?",
    skippable: true,
  },
];
