// Client side of the daily AI question feature. The server pieces live in
// supabase/daily-questions.sql (tables + answer RPC) and
// supabase/functions/daily-question/ (the generator). Until those are
// deployed, every call here fails soft: the app just shows no daily
// question.

import { supabase } from "./supabase";

export interface DailyPromptOption {
  value: string; // canonical -- what gets scored
  label: string; // personalized phrasing -- what the user sees
  quip?: string; // matchmaker's reply
}

export interface DailyPrompt {
  id: string;
  trait_key: string;
  ask_date: string;
  prompt: string;
  options: DailyPromptOption[] | null;
  scale_labels: [string, string] | null;
  quip: string | null;
  ai_generated: boolean;
  answer: unknown;
  answered_at: string | null;
}

// Asks the edge function for today's question (generating it on first call
// of the day), falling back to the newest stored prompt if the function
// isn't reachable. Returns null when the feature isn't set up or every
// trait is answered.
export async function fetchTodaysPrompt(): Promise<DailyPrompt | null> {
  try {
    const { data, error } = await supabase.functions.invoke("daily-question");
    if (!error && data?.prompt) return data.prompt as DailyPrompt;
    if (!error && data?.done) return null;
  } catch {
    // fall through to the read-only path
  }

  const { data: rows } = await supabase
    .from("daily_prompts")
    .select("*")
    .order("ask_date", { ascending: false })
    .limit(1);
  return (rows?.[0] as DailyPrompt | undefined) ?? null;
}

export async function answerDailyPrompt(promptId: string, answer: string | number): Promise<string | null> {
  const { error } = await supabase.rpc("answer_daily_prompt", {
    prompt_id: promptId,
    p_answer: answer,
  });
  return error ? error.message : null;
}

// Set after answering so the swipe screen knows to rebuild its queue with
// the sharper scores next time it gains focus.
let queueStale = false;
export function markQueueStale() {
  queueStale = true;
}
export function consumeQueueStale(): boolean {
  const was = queueStale;
  queueStale = false;
  return was;
}
