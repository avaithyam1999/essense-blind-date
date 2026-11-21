// Client side of the daily AI question feature. The server pieces live in
// supabase/daily-questions.sql (tables + answer RPC) and
// supabase/functions/daily-question/ (the generator).
//
// Every call returns a tagged result instead of throwing, so screens can tell
// "nothing to ask today" apart from "something broke" and from "your session
// expired". Until the backend is deployed, fetches come back as
// { status: "unavailable" } and the app just shows no daily question.

import type { SupabaseClient } from "@supabase/supabase-js";
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

export type FetchPromptResult =
  | { status: "ok"; prompt: DailyPrompt }
  | { status: "done" } // every trait answered; nothing left to ask
  | { status: "unauthenticated" } // session is gone or can't be refreshed
  | { status: "unavailable" } // backend not deployed / unreachable, nothing cached for today
  | { status: "error"; message: string };

export type AnswerFailureReason =
  | "already_answered"
  | "not_found"
  | "invalid_answer"
  | "unauthenticated"
  | "unknown";

export type AnswerResult = { ok: true } | { ok: false; reason: AnswerFailureReason; message: string };

// The edge function keys prompts by the UTC date (new Date().toISOString()),
// so the client must use the same day boundary when it reads the table.
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// supabase-js reports non-2xx function responses as FunctionsHttpError with
// the raw Response on `context`. Duck-typed so it works across versions.
function httpStatusOf(error: unknown): number | null {
  const ctx = (error as { context?: { status?: unknown } } | null)?.context;
  return typeof ctx?.status === "number" ? ctx.status : null;
}

async function errorBodyMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!ctx || typeof ctx.json !== "function") return null;
  try {
    const body = (await ctx.json()) as { error?: unknown } | null;
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

async function tryRefresh(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client.auth.refreshSession();
    return !error && Boolean(data?.session);
  } catch {
    return false;
  }
}

// Only today's row counts: an older prompt must never be shown as "today's
// question" (it would also let the user answer yesterday's question).
async function readTodaysStoredPrompt(client: SupabaseClient, today: string): Promise<FetchPromptResult> {
  const { data, error } = await client
    .from("daily_prompts")
    .select("*")
    .eq("ask_date", today)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { status: "unavailable" };
  const row = (data as DailyPrompt[] | null)?.[0];
  return row ? { status: "ok", prompt: row } : { status: "unavailable" };
}

// Asks the edge function for today's question (generating it on the first
// call of the day). A 401 triggers one session refresh and retry; a second
// 401 means the user has to sign in again. If the function itself can't be
// reached, falls back to reading today's stored prompt directly.
export async function fetchTodaysPrompt(
  client: SupabaseClient = supabase,
  now: Date = new Date()
): Promise<FetchPromptResult> {
  const today = todayUtc(now);

  for (let attempt = 0; attempt < 2; attempt++) {
    let data: unknown;
    let error: unknown;
    try {
      ({ data, error } = await client.functions.invoke("daily-question"));
    } catch (err) {
      error = err;
    }

    if (!error) {
      const body = data as { prompt?: DailyPrompt | null; done?: boolean } | null;
      if (body?.prompt) return { status: "ok", prompt: body.prompt };
      if (body?.done) return { status: "done" };
      return { status: "error", message: "The daily question came back empty." };
    }

    const status = httpStatusOf(error);
    if (status === 401) {
      if (attempt === 0 && (await tryRefresh(client))) continue;
      return { status: "unauthenticated" };
    }
    if (status !== null && status !== 404) {
      // The function ran and reported a real failure (e.g. 500). A 404 is
      // left to the fallback: it can mean the function isn't deployed yet.
      return { status: "error", message: (await errorBodyMessage(error)) ?? `Request failed (${status}).` };
    }
    break;
  }

  // Function not deployed, network/CORS failure, relay error: read-only path.
  return readTodaysStoredPrompt(client, today);
}

function classifyRpcError(error: { message?: string; code?: string }, status: number | undefined): AnswerFailureReason {
  const message = (error.message ?? "").toLowerCase();
  if (status === 401 || error.code === "PGRST301" || message.includes("jwt")) return "unauthenticated";
  if (message.includes("already answered")) return "already_answered";
  if (message.includes("prompt not found")) return "not_found";
  if (message.includes("canonical schema")) return "invalid_answer";
  return "unknown";
}

const FRIENDLY: Record<AnswerFailureReason, string> = {
  already_answered: "You already answered today's question.",
  not_found: "That question is no longer available.",
  invalid_answer: "That answer didn't fit this question. Try another option.",
  unauthenticated: "Your session expired. Please sign in again.",
  unknown: "Couldn't save your answer. Check your connection and try again.",
};

export async function answerDailyPrompt(
  promptId: string,
  answer: string | number,
  client: SupabaseClient = supabase
): Promise<AnswerResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let error: { message?: string; code?: string } | null = null;
    let status: number | undefined;
    try {
      const res = await client.rpc("answer_daily_prompt", { prompt_id: promptId, p_answer: answer });
      error = res.error;
      status = res.status;
    } catch (err) {
      error = { message: err instanceof Error ? err.message : String(err) };
    }
    if (!error) return { ok: true };

    const reason = classifyRpcError(error, status);
    if (reason === "unauthenticated" && attempt === 0 && (await tryRefresh(client))) continue;
    return { ok: false, reason, message: FRIENDLY[reason] };
  }
  return { ok: false, reason: "unauthenticated", message: FRIENDLY.unauthenticated };
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
