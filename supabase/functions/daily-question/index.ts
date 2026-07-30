// daily-question edge function: returns (generating if needed) the calling
// user's personalized question of the day.
//
// The question copy is unique per user -- Claude writes a scenario shaped by
// the user's own profile -- but the ANSWER SCHEMA is the fixed canonical one
// from trait_bank, so answers stay comparable across users and feed
// compute_compatibility() untouched (see supabase/daily-questions.sql).
//
// Idempotent per (user, day): first call of the day generates and inserts;
// later calls (and concurrent races, via the unique constraint) return the
// existing row. If the Anthropic call fails or returns something that
// doesn't validate, the trait's default phrasing from trait_bank is used --
// the user always gets a question, just not a personalized one.
//
// Deploy:
//   supabase functions deploy daily-question
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const MODEL = "claude-sonnet-5";

interface TraitOption {
  value: string;
  label: string;
}

interface Trait {
  trait_key: string;
  category: string;
  type: "scale" | "single_choice";
  options: TraitOption[] | null;
  scale_labels: [string, string] | null;
  default_prompt: string;
  ai_brief: string;
}

interface Generated {
  prompt: string;
  options?: { value: string; label: string; quip: string }[];
  scale_labels?: [string, string];
  quip?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  // Resolve the caller from their JWT, then do all writes as service role.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "not authenticated" }, 401);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await db
    .from("daily_prompts")
    .select("*")
    .eq("user_id", user.id)
    .eq("ask_date", today)
    .maybeSingle();
  if (existing) return json({ prompt: existing });

  const { data: profile } = await db
    .from("profiles")
    .select("questionnaire, self_description, city")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return json({ error: "no profile" }, 404);

  const { data: traits } = await db.from("trait_bank").select("*");
  if (!traits?.length) return json({ error: "trait_bank is empty" }, 500);

  // Traits the user hasn't answered yet (answers live in the questionnaire
  // jsonb under the trait's category).
  const questionnaire = (profile.questionnaire ?? {}) as Record<string, Record<string, unknown>>;
  const unanswered = (traits as Trait[]).filter(
    (t) => (questionnaire[t.category] ?? {})[t.trait_key] === undefined
  );
  if (unanswered.length === 0) {
    return json({ prompt: null, done: true, message: "all traits answered" });
  }

  // Deterministic pick so concurrent first-calls of the day agree.
  const dayNumber = Math.floor(Date.parse(today) / 86_400_000);
  const trait = unanswered[dayNumber % unanswered.length];

  const generated = await generate(trait, profile);

  const row = {
    user_id: user.id,
    trait_key: trait.trait_key,
    ask_date: today,
    prompt: generated?.prompt ?? trait.default_prompt,
    options:
      trait.type === "single_choice"
        ? generated?.options ?? trait.options
        : null,
    scale_labels:
      trait.type === "scale"
        ? generated?.scale_labels ?? trait.scale_labels
        : null,
    quip: generated?.quip ?? null,
    ai_generated: Boolean(generated),
  };

  // Race-safe: on conflict someone else inserted first -- return theirs.
  const { error: insertError } = await db.from("daily_prompts").insert(row);
  if (insertError && !insertError.message.includes("duplicate")) {
    return json({ error: insertError.message }, 500);
  }

  const { data: final } = await db
    .from("daily_prompts")
    .select("*")
    .eq("user_id", user.id)
    .eq("ask_date", today)
    .maybeSingle();
  return json({ prompt: final });
});

async function generate(
  trait: Trait,
  profile: { questionnaire: unknown; self_description: string | null; city: string | null }
): Promise<Generated | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const q = (profile.questionnaire ?? {}) as Record<string, Record<string, unknown>>;
  const flavor = {
    self_description: profile.self_description ?? "",
    city: profile.city ?? "",
    top_hobbies: q.interests?.top_hobbies ?? [],
    humor_style: q.personality?.humor_style ?? "",
    food_style: q.interests?.food_style ?? "",
    ideal_weekend: q.values_lifestyle?.ideal_weekend ?? "",
  };

  const schemaInstruction =
    trait.type === "single_choice"
      ? `Return JSON: {"prompt": string, "options": [{"value": string, "label": string, "quip": string}]}.
The "value" fields MUST be exactly this set (any order): ${JSON.stringify(
          (trait.options ?? []).map((o) => o.value)
        )}.
"label" is your fresh, personalized phrasing of that answer (first person, <= 90 chars).
"quip" is the matchmaker's one-line reply if the user picks it (<= 120 chars).`
      : `Return JSON: {"prompt": string, "scale_labels": [string, string], "quip": string}.
scale_labels are the two poles of a 1-5 scale, in the same low->high order as: ${JSON.stringify(
          trait.scale_labels
        )} (rephrase freely, <= 60 chars each, but the MEANING of each pole must not flip).
"quip" is the matchmaker's one-line reply after any answer (<= 120 chars).`;

  const body = {
    model: MODEL,
    max_tokens: 700,
    system: `You write daily questions for Essense, a no-photos dating app with a witty, warm "matchmaker" narrator voice (dry, kind, a little literary; never cutesy, never corporate). You will be given one personality trait to probe and a sketch of the user. Write ONE fresh scenario-style question (<= 220 chars) that feels personal to this user -- reference their world lightly (their hobbies, city, self-description) without quoting their data back verbatim and without being creepy about it. The question must genuinely measure the trait. Respond with ONLY the JSON object requested, no markdown fences, no commentary.`,
    messages: [
      {
        role: "user",
        content: `Trait to probe: ${trait.trait_key} — ${trait.ai_brief}

User sketch (their own words/answers): ${JSON.stringify(flavor)}

${schemaInstruction}`,
      },
    ],
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("anthropic error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()) as Generated;
    return validate(trait, parsed) ? parsed : null;
  } catch (err) {
    console.error("generation failed", err);
    return null;
  }
}

// Anything that fails validation falls back to the trait's default phrasing.
// The canonical values are the contract with the scoring engine.
function validate(trait: Trait, g: Generated): boolean {
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
