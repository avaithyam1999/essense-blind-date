// Reference implementation of the compatibility scoring model agreed on
// during the design phase:
//   - Three categories (values_lifestyle, interests, personality), weighted
//     evenly and averaged into a single 0-100 score.
//   - Scale questions score on closeness of answers (5-point scale -> 0-100).
//   - Single-choice questions score as match (100) / no-match (0), with a
//     small set of "adjacent" pairs given partial credit.
//   - Free-text-only questions (music_taste, media_taste, ideal_weekend,
//     first_date_activity, biggest_pet_peeve, described_by_friends) are
//     v1-excluded from scoring -- they're card/profile flavor, not math.
//     A text-embedding-based v2 is a reasonable future upgrade.
//   - Skipped questions are excluded from their category's average for
//     both users, so skipping never penalizes a user.
//   - Gender/orientation preference is NOT part of this score -- it's a
//     hard pre-filter applied before candidates ever reach this function.
//     If it's ever bypassed upstream, this function returns 0 as a
//     safety net (see computeCompatibility's guard clause).
//
// This mirrors the logic implemented server-side in supabase/schema.sql
// (compute_compatibility / build_queue). Keeping a TS copy is useful for
// client-side previews/tests without a round trip to the database.

import { QUESTIONS } from "./questions";
import type { Gender, QuestionnaireAnswers } from "./types";

// Pairs of single-choice answers across all questions that are "close enough"
// to deserve partial credit instead of a hard 0. Keyed by question key.
const ADJACENT_CREDIT: Record<string, [string, string][]> = {
  substance_use: [
    ["non-drinker", "sober"],
    ["social drinker", "regular drinker"],
  ],
  travel_frequency: [
    ["rarely travels", "few times a year"],
    ["monthly if possible", "constantly on the move"],
  ],
};

const PARTIAL_CREDIT_SCORE = 60;

function scaleScore(a: number, b: number): number {
  const distance = Math.abs(a - b); // 0-4 on a 1-5 scale
  return Math.max(0, 100 - distance * 25);
}

function choiceScore(key: string, a: string, b: string): number {
  if (a === b) return 100;
  const adjacentPairs = ADJACENT_CREDIT[key] ?? [];
  const isAdjacent = adjacentPairs.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x)
  );
  return isAdjacent ? PARTIAL_CREDIT_SCORE : 0;
}

function multiChoiceScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const overlap = a.filter((x) => b.includes(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : (overlap / union) * 100;
}

// Questions excluded from scoring in v1 (flavor/profile content only).
const TEXT_ONLY_UNSCORED = new Set([
  "ideal_weekend",
  "music_taste",
  "media_taste",
  "first_date_activity",
  "biggest_pet_peeve",
  "described_by_friends",
]);

function categoryScore(
  category: "values_lifestyle" | "interests" | "personality",
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number | null {
  const questionsInCategory = QUESTIONS.filter((q) => q.category === category);
  let total = 0;
  let count = 0;

  for (const q of questionsInCategory) {
    if (TEXT_ONLY_UNSCORED.has(q.key)) continue;

    const aVal = a[q.key];
    const bVal = b[q.key];

    // Skipped by either side -> excluded from the average, not penalized.
    if (aVal === undefined || aVal === null || bVal === undefined || bVal === null) {
      continue;
    }

    if (q.type === "scale") {
      total += scaleScore(Number(aVal), Number(bVal));
      count += 1;
    } else if (q.type === "single_choice") {
      total += choiceScore(q.key, String(aVal), String(bVal));
      count += 1;
    } else if (q.type === "multi_choice") {
      total += multiChoiceScore(aVal as string[], bVal as string[]);
      count += 1;
    }
  }

  if (count === 0) return null; // both sides skipped everything in this category
  return total / count;
}

export interface CompatibilityInput {
  gender: Gender;
  seeking: Gender[];
  questionnaire: QuestionnaireAnswers;
}

/**
 * Returns a 0-100 compatibility score between two users.
 *
 * Gender/orientation is a hard pre-filter upstream (see build_queue in
 * schema.sql) and should never reach this function for a genuine mismatch.
 * The guard clause below is a deliberate safety net, not the primary
 * enforcement mechanism -- per product decision, a mismatch here must
 * score 0 even if it somehow slips through queue generation.
 */
export function computeCompatibility(userA: CompatibilityInput, userB: CompatibilityInput): number {
  const aWantsB = userA.seeking.includes(userB.gender);
  const bWantsA = userB.seeking.includes(userA.gender);
  if (!aWantsB || !bWantsA) return 0;

  const categories: Array<"values_lifestyle" | "interests" | "personality"> = [
    "values_lifestyle",
    "interests",
    "personality",
  ];

  const scores = categories
    .map((c) =>
      categoryScore(
        c,
        userA.questionnaire[c] as unknown as Record<string, unknown>,
        userB.questionnaire[c] as unknown as Record<string, unknown>
      )
    )
    .filter((s): s is number => s !== null);

  if (scores.length === 0) return 0;

  const evenlyWeightedAverage = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return Math.round(evenlyWeightedAverage);
}
