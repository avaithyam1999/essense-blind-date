// Pure helpers for the daily-question edge function. No Deno or network
// APIs here, so the same file runs under the app's test runner.

export interface TraitOption {
  value: string;
  label: string;
}

export interface Trait {
  trait_key: string;
  category: string;
  type: "scale" | "single_choice";
  options: TraitOption[] | null;
  scale_labels: [string, string] | null;
  default_prompt: string;
  ai_brief: string;
}

export interface Generated {
  prompt: string;
  options?: { value: string; label: string; quip: string }[];
  scale_labels?: [string, string];
  quip?: string;
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Traits the user hasn't answered yet. Answers live in the questionnaire
// jsonb under the trait's category, same as onboarding answers.
export function unansweredTraits(traits: Trait[], questionnaire: unknown): Trait[] {
  const q = (questionnaire ?? {}) as Record<string, Record<string, unknown> | undefined>;
  return traits.filter((t) => (q[t.category] ?? {})[t.trait_key] === undefined);
}

// Deterministic for a given (unanswered set, day), so concurrent first calls
// of the day pick the same trait.
export function pickTrait(unanswered: Trait[], today: string): Trait {
  const dayNumber = Math.floor(Date.parse(today) / 86_400_000);
  return unanswered[dayNumber % unanswered.length];
}

// Anything that fails validation falls back to the trait's default phrasing.
// The canonical values are the contract with the scoring engine.
export function validate(trait: Trait, g: Generated): boolean {
  if (!g || typeof g.prompt !== "string" || !g.prompt.trim() || g.prompt.length > 300) return false;

  if (trait.type === "single_choice") {
    const canonical = (trait.options ?? []).map((o) => o.value).sort();
    if (!Array.isArray(g.options)) return false;
    const values = g.options.map((o) => o?.value).sort();
    if (JSON.stringify(values) !== JSON.stringify(canonical)) return false;
    return g.options.every(
      (o) =>
        typeof o.label === "string" &&
        o.label.trim().length > 0 &&
        o.label.length <= 140 &&
        (o.quip === undefined || (typeof o.quip === "string" && o.quip.length <= 200))
    );
  }

  return (
    Array.isArray(g.scale_labels) &&
    g.scale_labels.length === 2 &&
    g.scale_labels.every((l) => typeof l === "string" && l.trim().length > 0 && l.length <= 90) &&
    (g.quip === undefined || (typeof g.quip === "string" && g.quip.length <= 200))
  );
}
