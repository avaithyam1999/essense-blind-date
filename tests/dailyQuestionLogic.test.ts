import { describe, expect, it } from "vitest";
import {
  corsHeaders,
  pickTrait,
  unansweredTraits,
  validate,
  type Trait,
} from "../supabase/functions/daily-question/logic";

const choiceTrait: Trait = {
  trait_key: "money_style",
  category: "values_lifestyle",
  type: "single_choice",
  options: [
    { value: "saver", label: "A saver" },
    { value: "spender", label: "A spender" },
  ],
  scale_labels: null,
  default_prompt: "Money?",
  ai_brief: "money",
};

const scaleTrait: Trait = {
  trait_key: "tidiness_scale",
  category: "values_lifestyle",
  type: "scale",
  options: null,
  scale_labels: ["Lived-in", "Tidy"],
  default_prompt: "Tidy?",
  ai_brief: "tidiness",
};

const otherTrait: Trait = { ...scaleTrait, trait_key: "risk_appetite", category: "personality" };

describe("unansweredTraits", () => {
  it("skips traits already answered under their category", () => {
    const q = { values_lifestyle: { money_style: "saver" }, personality: {} };
    expect(unansweredTraits([choiceTrait, scaleTrait, otherTrait], q)).toEqual([scaleTrait, otherTrait]);
  });

  it("treats a null questionnaire as nothing answered", () => {
    expect(unansweredTraits([choiceTrait], null)).toEqual([choiceTrait]);
  });

  it("counts falsy answers like 0 or empty string as answered", () => {
    const q = { values_lifestyle: { tidiness_scale: 0, money_style: "" } };
    expect(unansweredTraits([choiceTrait, scaleTrait], q)).toEqual([]);
  });
});

describe("pickTrait", () => {
  it("is deterministic per day and rotates across days", () => {
    const list = [choiceTrait, scaleTrait, otherTrait];
    expect(pickTrait(list, "2026-11-20")).toBe(pickTrait(list, "2026-11-20"));
    const picks = new Set(["2026-11-20", "2026-11-21", "2026-11-22"].map((d) => pickTrait(list, d).trait_key));
    expect(picks.size).toBe(3);
  });
});

describe("validate", () => {
  it("accepts a personalized single-choice question with the canonical values", () => {
    expect(
      validate(choiceTrait, {
        prompt: "Payday hits. What happens next?",
        options: [
          { value: "spender", label: "Dinner's on me", quip: "Generous." },
          { value: "saver", label: "Straight into savings", quip: "Prudent." },
        ],
      })
    ).toBe(true);
  });

  it("rejects options whose values drift from the canonical set", () => {
    expect(
      validate(choiceTrait, {
        prompt: "Payday?",
        options: [
          { value: "saver", label: "Save", quip: "" },
          { value: "big spender", label: "Spend", quip: "" },
        ],
      })
    ).toBe(false);
  });

  it("rejects a missing or oversized prompt", () => {
    expect(validate(scaleTrait, { prompt: " ", scale_labels: ["a", "b"] })).toBe(false);
    expect(validate(scaleTrait, { prompt: "x".repeat(301), scale_labels: ["a", "b"] })).toBe(false);
  });

  it("requires exactly two non-empty scale labels", () => {
    expect(validate(scaleTrait, { prompt: "Tidy?", scale_labels: ["Messy", "Neat"], quip: "Ha." })).toBe(true);
    expect(validate(scaleTrait, { prompt: "Tidy?", scale_labels: ["Messy", ""] })).toBe(false);
    expect(validate(scaleTrait, { prompt: "Tidy?" })).toBe(false);
  });
});

describe("corsHeaders", () => {
  it("allows the headers supabase-js sends from the browser", () => {
    const allowed = corsHeaders["Access-Control-Allow-Headers"].split(",").map((h) => h.trim());
    expect(allowed).toEqual(expect.arrayContaining(["authorization", "apikey", "x-client-info", "content-type"]));
  });
});
