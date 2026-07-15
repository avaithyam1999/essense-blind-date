// The onboarding questionnaire: ~28 questions across three evenly-weighted
// categories (values_lifestyle, interests, personality). Answers feed
// lib/compatibility.ts and compute_compatibility() in schema.sql.
//
// Options are { value, label } pairs. `value` is the canonical string stored
// in the questionnaire jsonb and compared by both scoring implementations --
// NEVER change existing values without migrating stored answers (including
// the seeded profiles). `label` is what the user sees, so copy there can be
// rewritten freely.
//
// Questions with `allowCustom` also accept a free-text answer. Custom answers
// are stored under `<key>_custom` and the canonical key is left unset, so
// scoring treats the question as skipped (excluded, never penalized) for
// that user -- same semantics as `skippable`.

export type QuestionType = "scale" | "single_choice" | "multi_choice" | "text";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionDef {
  key: string;
  category: "values_lifestyle" | "interests" | "personality";
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[]; // for single_choice / multi_choice
  scaleLabels?: [string, string]; // for scale, e.g. ["Routine", "Spontaneous"]
  skippable?: boolean;
  allowCustom?: boolean; // single_choice only: offer a write-your-own answer
  maxSelect?: number; // for multi_choice, e.g. top 3 hobbies
}

export const QUESTIONS: QuestionDef[] = [
  // --- Values & lifestyle (10) ---
  {
    key: "relationship_intent",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "What are you hoping to find here?",
    options: [
      { value: "long-term relationship", label: "The real thing — a long-term partner" },
      { value: "long-term, open to short-term", label: "Ideally long-term, but open to seeing where things go" },
      { value: "short-term, open to long-term", label: "Something casual that could surprise me" },
      { value: "not sure yet, figuring it out", label: "Honestly? Still figuring that out" },
    ],
  },
  {
    key: "wants_kids",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "Do you see kids in your future?",
    options: [
      { value: "yes", label: "Yes, definitely" },
      { value: "no", label: "No — not for me" },
      { value: "unsure", label: "Not sure yet" },
      { value: "already have kids, open to more", label: "I have kids, and I'm open to more" },
      { value: "already have kids, done", label: "I have kids, and my hands are full" },
    ],
  },
  {
    key: "career_centrality",
    category: "values_lifestyle",
    type: "scale",
    prompt: "How big a place does work and ambition take up in your life right now?",
    scaleLabels: ["A job's a job", "It's my whole world"],
  },
  {
    key: "conflict_style",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "When something's bothering you in a relationship, what do you actually do?",
    allowCustom: true,
    options: [
      { value: "direct and immediate", label: "Say it right away, even if it's awkward" },
      { value: "needs time to process first", label: "Go quiet for a bit, then talk once I've sorted my head" },
      { value: "collaborative problem-solver", label: "Sit down together and figure it out as a team" },
      { value: "avoids conflict, works on it", label: "Avoid it longer than I should — I'm working on that" },
    ],
  },
  {
    key: "substance_use",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "Where do you land on drinking?",
    options: [
      { value: "non-drinker", label: "I don't drink" },
      { value: "social drinker", label: "Drinks with friends, that's about it" },
      { value: "regular drinker", label: "A good drink is one of life's regular pleasures" },
      { value: "420-friendly", label: "Not big on alcohol — 420-friendly though" },
      { value: "sober", label: "Sober, and happy about it" },
    ],
  },
  {
    key: "chronotype",
    category: "values_lifestyle",
    type: "single_choice",
    prompt: "When are you at your best?",
    options: [
      { value: "early bird", label: "Morning — I'm up with the sun" },
      { value: "night owl", label: "Night — I come alive after dark" },
      { value: "somewhere in between", label: "Somewhere in between" },
    ],
  },
  {
    key: "routine_vs_spontaneity",
    category: "values_lifestyle",
    type: "scale",
    prompt: "Routine or spontaneity?",
    scaleLabels: ["I love my routines", "Throw out the plan"],
  },
  {
    key: "religion_importance",
    category: "values_lifestyle",
    type: "scale",
    prompt: "How much does shared religion or spirituality matter in a partner?",
    scaleLabels: ["Doesn't matter", "Essential"],
    skippable: true,
  },
  {
    key: "politics_importance",
    category: "values_lifestyle",
    type: "scale",
    prompt: "How much does political alignment matter in a partner?",
    scaleLabels: ["Doesn't matter", "Essential"],
    skippable: true,
  },
  {
    key: "ideal_weekend",
    category: "values_lifestyle",
    type: "text",
    prompt: "Paint the picture: your ideal weekend, start to finish.",
    skippable: true,
  },

  // --- Interests & activities (9) ---
  {
    key: "top_hobbies",
    category: "interests",
    type: "multi_choice",
    prompt: "Pick the three things you actually spend your time on.",
    maxSelect: 3,
    options: [
      { value: "hiking", label: "Hiking" },
      { value: "cooking", label: "Cooking" },
      { value: "reading", label: "Reading" },
      { value: "gaming", label: "Gaming" },
      { value: "live music", label: "Live music" },
      { value: "travel", label: "Travel" },
      { value: "fitness", label: "Fitness" },
      { value: "art & museums", label: "Art & museums" },
      { value: "board games", label: "Board games" },
      { value: "dancing", label: "Dancing" },
      { value: "photography", label: "Photography" },
      { value: "gardening", label: "Gardening" },
      { value: "volunteering", label: "Volunteering" },
      { value: "sports", label: "Sports" },
      { value: "writing", label: "Writing" },
      { value: "crafting", label: "Crafting" },
    ],
  },
  {
    key: "social_battery",
    category: "interests",
    type: "scale",
    prompt: "A packed social weekend leaves you feeling...",
    scaleLabels: ["Drained — I need a quiet day", "Charged up — more, please"],
  },
  {
    key: "travel_frequency",
    category: "interests",
    type: "single_choice",
    prompt: "How often do you get out of town?",
    options: [
      { value: "rarely travels", label: "Rarely — the good stuff is here" },
      { value: "few times a year", label: "A few trips a year" },
      { value: "monthly if possible", label: "Monthly, whenever I can swing it" },
      { value: "constantly on the move", label: "Constantly — I'm basically a suitcase with a person attached" },
    ],
  },
  {
    key: "fitness_level",
    category: "interests",
    type: "single_choice",
    prompt: "How do you and exercise get along?",
    options: [
      { value: "not really into it", label: "We don't, really" },
      { value: "casually active", label: "Casually — walks, the occasional workout" },
      { value: "regular gym-goer", label: "It's part of my week, every week" },
      { value: "highly active/athlete", label: "Training is a big part of who I am" },
    ],
  },
  {
    key: "food_style",
    category: "interests",
    type: "single_choice",
    prompt: "What's your relationship with food?",
    allowCustom: true,
    options: [
      { value: "adventurous eater", label: "I'll try anything once" },
      { value: "comfort food loyalist", label: "I know what I love, and I order it every time" },
      { value: "health-conscious", label: "Mostly healthy — I actually read the labels" },
      { value: "foodie/loves fine dining", label: "Food is an event — tasting menus, hidden gems" },
    ],
  },
  {
    key: "music_taste",
    category: "interests",
    type: "text",
    prompt: "What's been on repeat lately?",
    skippable: true,
  },
  {
    key: "media_taste",
    category: "interests",
    type: "text",
    prompt: "A book, movie, or show you'd actually recommend?",
    skippable: true,
  },
  {
    key: "first_date_activity",
    category: "interests",
    type: "text",
    prompt: "Describe a first date you'd genuinely enjoy — not the polite answer.",
    skippable: true,
  },
  {
    key: "hosting_style",
    category: "interests",
    type: "single_choice",
    prompt: "It's Saturday night and there's a party. Where are you?",
    options: [
      { value: "hosting it", label: "It's at my place — I'm hosting" },
      { value: "the last one to leave", label: "There until the lights come on" },
      { value: "there for an hour, then gone", label: "One good hour, then I vanish" },
      { value: "not there", label: "Not there — you'll get my recap over coffee" },
    ],
  },

  // --- Personality (9) ---
  {
    key: "social_energy_scale",
    category: "personality",
    type: "scale",
    prompt: "Where does your energy come from?",
    scaleLabels: ["Time alone", "Time with people"],
  },
  {
    key: "planner_vs_spontaneous",
    category: "personality",
    type: "scale",
    prompt: "There's a trip coming up. What does your version of “ready” look like?",
    scaleLabels: ["Spreadsheet and printed tickets", "A bag packed that morning"],
  },
  {
    key: "emotional_expressiveness",
    category: "personality",
    type: "scale",
    prompt: "How easily do your feelings show?",
    scaleLabels: ["I keep them close", "You'll know within ten seconds"],
  },
  {
    key: "humor_style",
    category: "personality",
    type: "single_choice",
    prompt: "What actually makes you laugh?",
    allowCustom: true,
    options: [
      { value: "dry/sarcastic", label: "Deadpan delivery and well-placed sarcasm" },
      { value: "silly/goofy", label: "Pure silliness — the dumber the better" },
      { value: "witty/quick", label: "Quick wit and wordplay" },
      { value: "dark humor", label: "The jokes you check the room before making" },
      { value: "punny", label: "Puns. I will not be apologizing" },
      { value: "observational", label: "The comedy of everyday life" },
    ],
  },
  {
    key: "love_language",
    category: "personality",
    type: "single_choice",
    prompt: "How do you naturally show someone you care?",
    options: [
      { value: "words of affirmation", label: "I tell them — often, and specifically" },
      { value: "quality time", label: "I give them my full attention and my time" },
      { value: "acts of service", label: "I do things — fix it, cook it, handle it" },
      { value: "physical touch", label: "I'm a hand-holder, a hugger, always close" },
      { value: "gifts", label: "I find them the perfect little thing" },
    ],
  },
  {
    key: "recharge_style",
    category: "personality",
    type: "single_choice",
    prompt: "Rough week. How do you put yourself back together?",
    allowCustom: true,
    options: [
      { value: "alone time", label: "Door closed, phone down, alone" },
      { value: "time with close friends", label: "Dinner with my people" },
      { value: "physical activity", label: "I sweat it out" },
      { value: "creative outlets", label: "I make something — cook, paint, write" },
    ],
  },
  {
    key: "communication_style",
    category: "personality",
    type: "single_choice",
    prompt: "How do you talk about hard things?",
    options: [
      { value: "direct", label: "Head-on — I say the thing" },
      { value: "gentle/diplomatic", label: "Carefully — I choose soft words" },
      { value: "needs processing time", label: "Slowly — I think before I speak" },
      { value: "very expressive", label: "Fully — you'll get the whole picture, feelings included" },
    ],
  },
  {
    key: "biggest_pet_peeve",
    category: "personality",
    type: "text",
    prompt: "What's a tiny thing that drives you up the wall?",
    skippable: true,
  },
  {
    key: "described_by_friends",
    category: "personality",
    type: "text",
    prompt: "Your best friend describes you in one sentence. What do they say?",
    skippable: true,
  },
];
