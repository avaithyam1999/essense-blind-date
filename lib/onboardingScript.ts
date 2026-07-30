// The onboarding conversation: the questionnaire from lib/questions.ts
// recast as a matchmaker chat (see the approved onboarding-concept mockup).
//
// Hard rule: every answer still lands on the canonical keys/values from
// QUESTIONS, so lib/compatibility.ts and compute_compatibility() in
// schema.sql need no changes. This file only decides HOW each question is
// asked (chat chips, rapid-fire deck card, free text) and what the
// matchmaker says back. Copy here can be rewritten freely; `value`s cannot.
//
// Scale questions (1-5) become deck cards: the two scaleLabels ARE the
// anchors of the scale, so a decisive swipe maps to 1 or 5 and the
// "somewhere in between" pill maps to 3. Values 2/4 are unreachable in this
// UI -- accepted: gut calls are poles, and distance-based scoring handles
// the coarser granularity fine alongside seeded 1-5 answers.
//
// In matchmaker copy, *asterisks* mark the plum-italic emphasis spans
// (rendered by the chat screen, mirroring <em> in the mockup).

import { QUESTIONS, type QuestionDef } from "./questions";

export interface Payoff {
  quip?: string; // matchmaker's serif reply bubble
  stat?: string; // mono stat pill
}

export interface DeckSide {
  label: string;
  value: string | number;
  stat?: string;
}

export interface DeckCardDef {
  key: string;
  kicker: string; // small mono context line on the card
  a: DeckSide; // left swipe
  b: DeckSide; // right swipe
  mid?: DeckSide; // centered pill, e.g. "Somewhere in between"
  skippable?: boolean;
}

export type Step =
  | { kind: "phase"; label: string } // updates the header eyebrow
  | { kind: "say"; text: string; delay?: number }
  | { kind: "button"; label: string }
  | {
      kind: "chips";
      question: QuestionDef;
      ask?: string; // scenario framing; defaults to question.prompt
      payoffs?: Record<string, Payoff>;
      customPayoff?: Payoff; // reply to a write-your-own answer
    }
  | { kind: "deck"; title: string; cards: DeckCardDef[] }
  | { kind: "multi"; question: QuestionDef; payoff?: Payoff }
  | { kind: "text"; question: QuestionDef; payoff?: Payoff; skipQuip?: string }
  | { kind: "finale" };

const byKey = new Map(QUESTIONS.map((q) => [q.key, q]));

function q(key: string): QuestionDef {
  const def = byKey.get(key);
  if (!def) throw new Error(`onboardingScript: unknown question key "${key}"`);
  return def;
}

// Deck card for a 1-5 scale question: poles from scaleLabels -> 1 / 5,
// optional middle pill -> 3.
function scaleCard(
  key: string,
  opts: { kicker?: string; statA?: string; statB?: string; midLabel?: string; statMid?: string }
): DeckCardDef {
  const def = q(key);
  if (def.type !== "scale" || !def.scaleLabels) {
    throw new Error(`onboardingScript: "${key}" is not a scale question`);
  }
  return {
    key,
    kicker: opts.kicker ?? def.prompt,
    a: { label: def.scaleLabels[0], value: 1, stat: opts.statA },
    b: { label: def.scaleLabels[1], value: 5, stat: opts.statB },
    mid: { label: opts.midLabel ?? "Somewhere in between", value: 3, stat: opts.statMid },
    skippable: def.skippable,
  };
}

export const SCRIPT: Step[] = [
  { kind: "phase", label: "getting to know you" },
  { kind: "say", text: "Hi. I'm your matchmaker." },
  {
    kind: "say",
    text: "No photos here — I work off *who you actually are*. Which means I need to get to know you a little.",
    delay: 1100,
  },
  { kind: "say", text: "Not with a form. I promise." },
  { kind: "button", label: "Okay, let's go" },
  { kind: "say", text: "First: five snap calls. Don't think — just go with your gut." },

  {
    kind: "deck",
    title: "Rapid fire",
    cards: [
      {
        key: "chronotype",
        kicker: "When are you at your best?",
        a: { label: "Early bird", value: "early bird", stat: "Early birds: 46% of Essense. The good pastries never sell out on your watch." },
        b: { label: "Night owl", value: "night owl", stat: "Night owls: 54% of Essense. The city agrees with you." },
        mid: { label: "Somewhere in between", value: "somewhere in between", stat: "The flexible middle. Rarer than both extremes, honestly." },
      },
      scaleCard("routine_vs_spontaneity", {
        statA: "Routine people: 41%. Your group chat thanks you.",
        statB: "59% throw out the plan — and somehow reservations still happen.",
        statMid: "A routine with escape hatches. Balanced.",
      }),
      scaleCard("social_energy_scale", {
        statA: "57% recharge solo. Door closed, phone down.",
        statB: "43% need the group. Batteries included.",
        statMid: "Ambivert, noted. You'll match widely.",
      }),
      scaleCard("planner_vs_spontaneous", {
        statA: "The itinerary people. Someone has to know the gate number.",
        statB: "Bag packed that morning — 1 in 3, and proud.",
        statMid: "A loose plan, held loosely. Respect.",
      }),
      scaleCard("social_battery", {
        statA: "Quiet-Sunday people: half of Essense. The other half is still out.",
        statB: "More, please. The calendar fears you.",
        statMid: "Depends on the weekend. Fair.",
      }),
    ],
  },

  { kind: "say", text: "See? Painless. You're quicker than most." },

  { kind: "phase", label: "the honest part" },
  {
    kind: "chips",
    question: q("relationship_intent"),
    ask: "Now the honest one. What are you *actually* hoping to find here?",
    payoffs: {
      "long-term relationship": { quip: "Good. I don't like wasting anyone's time either." },
      "long-term, open to short-term": { quip: "A compass with an open heart. I can work with that." },
      "short-term, open to long-term": { quip: "Honest. The best stories start casual anyway." },
      "not sure yet, figuring it out": { quip: "That's more honest than half the answers I get. It counts." },
    },
  },
  {
    kind: "chips",
    question: q("wants_kids"),
    payoffs: {
      yes: { quip: "Noted — in ink." },
      no: { quip: "Clear. Clarity saves everyone time." },
      unsure: { quip: "Fair. It's a big question — I only match it, I don't rush it." },
      "already have kids, open to more": { quip: "A full house that might get fuller. Lovely." },
      "already have kids, done": { quip: "Hands full, heart full. Got it." },
    },
  },
  {
    kind: "chips",
    question: q("conflict_style"),
    ask: "Scenario. Your date is 25 minutes late. They just texted: *“omw lol.”* It bugs you. What do you actually do?",
    payoffs: {
      "direct and immediate": {
        quip: "Direct. They'll always know where they stand — rarer than you'd think.",
        stat: "31% of Essense says it to their face.",
      },
      "needs time to process first": {
        quip: "A slow burn. Noted — and respected.",
        stat: "26% need the walk home first. Fair.",
      },
      "collaborative problem-solver": {
        quip: "A team. That's the whole assignment, honestly.",
        stat: "28% lead with “we.” Good sign.",
      },
      "avoids conflict, works on it": {
        quip: "Self-aware about it, too. That counts for more than you'd think.",
        stat: "24% are working on it. Respect.",
      },
    },
  },
  {
    kind: "chips",
    question: q("substance_use"),
    ask: "Logistics, briefly. Where do you land on drinking?",
    payoffs: {
      "non-drinker": { quip: "Noted. Plenty of great first dates run on coffee." },
      "social drinker": { quip: "The classic. A drink with friends, and that's the shape of it." },
      "regular drinker": { quip: "A person of ritual. Noted." },
      "420-friendly": { quip: "Understood. I'll keep it in mind." },
      sober: { quip: "And happy about it — that part matters. Noted." },
    },
  },

  { kind: "say", text: "Quick hands again — four more, a shade deeper this time." },
  {
    kind: "deck",
    title: "Rapid fire",
    cards: [
      scaleCard("career_centrality", {
        statA: "Work-to-live: a quiet majority.",
        statB: "The ambitious lane. Plenty of company there.",
        statMid: "Ambition with office hours. Balanced.",
      }),
      scaleCard("emotional_expressiveness", {
        statA: "The slow reveal. Some people love the unwrapping.",
        statB: "An open book, large print. Refreshing.",
        statMid: "Readable, with footnotes. Noted.",
      }),
      scaleCard("religion_importance", {
        statA: "Noted — hearts over hymnals.",
        statB: "Essential, understood. I take that seriously.",
        statMid: "It matters some. That nuance helps me.",
      }),
      scaleCard("politics_importance", {
        statA: "Noted — you vote across the aisle of the heart.",
        statB: "Aligned or nothing. Clear, and useful.",
        statMid: "Somewhere in the middle — like most good conversations.",
      }),
    ],
  },
  {
    kind: "say",
    text: "For the record: the religion-and-politics stuff is only ever used to *match you better*. It's never shown to anyone.",
    delay: 1100,
  },

  { kind: "phase", label: "a life with you" },
  { kind: "say", text: "Now the fun part — what a week with you actually looks like." },
  {
    kind: "multi",
    question: q("top_hobbies"),
    payoff: { quip: "A person emerges. I'm starting to see the shape of your Saturdays." },
  },
  {
    kind: "chips",
    question: q("travel_frequency"),
    payoffs: {
      "rarely travels": { quip: "A homebody with a home worth staying in. Noted." },
      "few times a year": { quip: "A few good trips beats a dozen rushed ones." },
      "monthly if possible": { quip: "Always a bag half-packed. Noted." },
      "constantly on the move": { quip: "A suitcase with a person attached — your words, basically." },
    },
  },
  {
    kind: "chips",
    question: q("fitness_level"),
    payoffs: {
      "not really into it": { quip: "Honesty over cardio. Noted." },
      "casually active": { quip: "Walks count. They absolutely count." },
      "regular gym-goer": { quip: "Part of the week, every week. Consistency looks good on paper." },
      "highly active/athlete": { quip: "Training as identity. I know exactly who to put in front of you." },
    },
  },
  {
    kind: "chips",
    question: q("food_style"),
    payoffs: {
      "adventurous eater": { quip: "You'll try anything once — the best first-date policy there is." },
      "comfort food loyalist": { quip: "A usual, perfected. Consistency is a love language." },
      "health-conscious": { quip: "Labels read, choices made. Noted." },
      "foodie/loves fine dining": { quip: "Food as an event. I have people for you." },
    },
  },
  {
    kind: "chips",
    question: q("hosting_style"),
    payoffs: {
      "hosting it": { quip: "1 in 3 hosts. Someone has to own the playlist — it's you.", stat: "Hosts match well with last-to-leavers. Just saying." },
      "the last one to leave": { quip: "There till the lights come on. The party thanks you." },
      "there for an hour, then gone": { quip: "The cameo. Quality over quantity — no notes." },
      "not there": { quip: "The recap-over-coffee correspondent. Honestly, a vital role." },
    },
  },

  { kind: "phase", label: "how you're wired" },
  {
    kind: "chips",
    question: q("humor_style"),
    payoffs: {
      "dry/sarcastic": { quip: "Deadpan. I'll match you with someone who can tell when you're joking. Mostly." },
      "silly/goofy": { quip: "The dumber the better — a sign of a secure person, actually." },
      "witty/quick": { quip: "Wordplay. The sparring kind of flirting. Noted." },
      "dark humor": { quip: "You check the room first. That's the important part." },
      punny: { quip: "No apology necessary. Some people find that *very* attractive. I'll find them." },
      observational: { quip: "The comedy that's just... true. Noted." },
    },
  },
  {
    kind: "chips",
    question: q("love_language"),
    payoffs: {
      "words of affirmation": { quip: "Often, and specifically. The specificity is the whole trick." },
      "quality time": { quip: "Full attention — the scarcest resource there is." },
      "acts of service": { quip: "Fix it, cook it, handle it. Love with its sleeves rolled up." },
      "physical touch": { quip: "A hand-holder. Noted, warmly." },
      gifts: { quip: "The perfect little thing. It's about the noticing, isn't it." },
    },
  },
  {
    kind: "chips",
    question: q("recharge_style"),
    payoffs: {
      "alone time": { quip: "Door closed, phone down. Restoration by subtraction." },
      "time with close friends": { quip: "Dinner with your people. The reliable medicine." },
      "physical activity": { quip: "Sweat it out. The body keeps the score and you settle the tab." },
      "creative outlets": { quip: "You make something. That says more than most answers here." },
    },
  },
  {
    kind: "chips",
    question: q("communication_style"),
    payoffs: {
      direct: { quip: "You say the thing. Rarer than it should be." },
      "gentle/diplomatic": { quip: "Soft words, chosen carefully. People remember that." },
      "needs processing time": { quip: "Think first, speak once. Noted." },
      "very expressive": { quip: "The whole picture, feelings included. Some people need exactly that." },
    },
  },

  { kind: "phase", label: "your words now" },
  {
    kind: "say",
    text: "Last stretch — six little ones, *your words* this time. Short is fine. Skipping is allowed, and never held against you.",
    delay: 1100,
  },
  {
    kind: "text",
    question: q("ideal_weekend"),
    payoff: { quip: "I can picture it. That's the point of asking." },
    skipQuip: "Skipped — no penalty. I said what I said.",
  },
  {
    kind: "text",
    question: q("music_taste"),
    payoff: { quip: "Adding it to the file. Taste travels well." },
  },
  {
    kind: "text",
    question: q("media_taste"),
    payoff: { quip: "A real recommendation, not the polite one. Thank you." },
  },
  {
    kind: "text",
    question: q("first_date_activity"),
    payoff: { quip: "Now *that* sounds like a date. Filed under: actually fun." },
  },
  {
    kind: "text",
    question: q("biggest_pet_peeve"),
    payoff: { quip: "Noted, and I'll quietly screen for it. That's between us." },
  },
  {
    kind: "text",
    question: q("described_by_friends"),
    payoff: { quip: "Good friends, good sentence." },
  },

  { kind: "phase", label: "deck unlocked" },
  {
    kind: "say",
    text: "That's everything I need for today. Your profile does the talking from here — and it gets sharper every time we talk.",
    delay: 1100,
  },
  { kind: "finale" },
];

// Every question key must be asked exactly once, or the questionnaire
// silently loses signals. Checked at import time in dev builds.
export function scriptQuestionKeys(script: Step[]): string[] {
  const keys: string[] = [];
  for (const step of script) {
    if (step.kind === "chips" || step.kind === "multi" || step.kind === "text") keys.push(step.question.key);
    if (step.kind === "deck") keys.push(...step.cards.map((c) => c.key));
  }
  return keys;
}

if (__DEV__) {
  const asked = scriptQuestionKeys(SCRIPT);
  const askedSet = new Set(asked);
  const missing = QUESTIONS.filter((def) => !askedSet.has(def.key)).map((def) => def.key);
  const dupes = asked.filter((k, i) => asked.indexOf(k) !== i);
  const unknown = asked.filter((k) => !byKey.has(k));
  if (missing.length || dupes.length || unknown.length) {
    console.warn("onboardingScript coverage problem", { missing, dupes, unknown });
  }
}
