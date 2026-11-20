import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// The real client pulls in React Native storage; every test passes its own fake.
vi.mock("../lib/supabase", () => ({ supabase: {} }));

import {
  answerDailyPrompt,
  consumeQueueStale,
  fetchTodaysPrompt,
  markQueueStale,
  todayUtc,
  type DailyPrompt,
} from "../lib/dailyQuestion";

const NOW = new Date("2026-11-20T23:30:00Z");

const prompt: DailyPrompt = {
  id: "p1",
  trait_key: "tidiness_scale",
  ask_date: "2026-11-20",
  prompt: "Your space, on an average Tuesday?",
  options: null,
  scale_labels: ["Lived-in", "Everything in its place"],
  quip: "Noted.",
  ai_generated: true,
  answer: null,
  answered_at: null,
};

// Shape of a supabase-js FunctionsHttpError: the Response sits on `context`.
function httpError(status: number, body: unknown = {}) {
  return {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: { status, json: async () => body },
  };
}

type InvokeResult = { data: unknown; error: unknown };

function fakeClient(opts: {
  invoke?: InvokeResult[] | (() => Promise<InvokeResult>);
  refresh?: { session: unknown; error: unknown };
  rows?: { data: unknown; error: unknown };
  rpc?: { error: unknown; status?: number }[];
}) {
  const invokeQueue = Array.isArray(opts.invoke) ? [...opts.invoke] : null;
  const rpcQueue = [...(opts.rpc ?? [])];
  type Query = {
    select: () => Query;
    eq: (col: string, val: unknown) => Query;
    order: () => Query;
    limit: () => Promise<{ data: unknown; error: unknown }>;
  };
  const query: Query = {
    select: vi.fn(() => query),
    eq: vi.fn((_col: string, _val: unknown) => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => opts.rows ?? { data: [], error: null }),
  };
  const client = {
    functions: {
      invoke: vi.fn(async () => {
        if (typeof opts.invoke === "function") return opts.invoke();
        return invokeQueue!.shift() ?? { data: null, error: httpError(500) };
      }),
    },
    auth: {
      refreshSession: vi.fn(async () => ({
        data: { session: opts.refresh?.session ?? null },
        error: opts.refresh?.error ?? null,
      })),
    },
    from: vi.fn(() => query),
    rpc: vi.fn(async () => {
      const next = rpcQueue.shift() ?? { error: null, status: 204 };
      return { data: null, error: next.error, status: next.status ?? (next.error ? 400 : 204) };
    }),
  };
  return { client: client as unknown as SupabaseClient, raw: client, query };
}

describe("todayUtc", () => {
  it("uses the UTC calendar day, matching the edge function", () => {
    expect(todayUtc(new Date("2026-11-20T23:59:59-08:00"))).toBe("2026-11-21");
    expect(todayUtc(NOW)).toBe("2026-11-20");
  });
});

describe("fetchTodaysPrompt", () => {
  it("returns the prompt from the edge function", async () => {
    const { client, raw } = fakeClient({ invoke: [{ data: { prompt }, error: null }] });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "ok", prompt });
    expect(raw.functions.invoke).toHaveBeenCalledWith("daily-question");
    expect(raw.from).not.toHaveBeenCalled();
  });

  it("reports done when every trait is answered", async () => {
    const { client } = fakeClient({ invoke: [{ data: { prompt: null, done: true }, error: null }] });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "done" });
  });

  it("treats an empty success body as an error, not as done", async () => {
    const { client } = fakeClient({ invoke: [{ data: {}, error: null }] });
    expect((await fetchTodaysPrompt(client, NOW)).status).toBe("error");
  });

  it("refreshes the session once on 401 and retries", async () => {
    const { client, raw } = fakeClient({
      invoke: [
        { data: null, error: httpError(401) },
        { data: { prompt }, error: null },
      ],
      refresh: { session: { access_token: "new" }, error: null },
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "ok", prompt });
    expect(raw.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(raw.functions.invoke).toHaveBeenCalledTimes(2);
  });

  it("returns unauthenticated when the refresh fails", async () => {
    const { client, raw } = fakeClient({
      invoke: [{ data: null, error: httpError(401) }],
      refresh: { session: null, error: { message: "refresh token revoked" } },
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "unauthenticated" });
    expect(raw.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it("returns unauthenticated when the retry is still 401", async () => {
    const { client, raw } = fakeClient({
      invoke: [
        { data: null, error: httpError(401) },
        { data: null, error: httpError(401) },
      ],
      refresh: { session: { access_token: "new" }, error: null },
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "unauthenticated" });
    expect(raw.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's message on a 500", async () => {
    const { client, raw } = fakeClient({
      invoke: [{ data: null, error: httpError(500, { error: "trait_bank is empty" }) }],
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "error", message: "trait_bank is empty" });
    expect(raw.from).not.toHaveBeenCalled();
  });

  it("falls back to today's stored prompt when the function is unreachable", async () => {
    const { client, query } = fakeClient({
      invoke: [{ data: null, error: { name: "FunctionsFetchError", message: "Failed to send", context: {} } }],
      rows: { data: [prompt], error: null },
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "ok", prompt });
    expect(query.eq).toHaveBeenCalledWith("ask_date", "2026-11-20");
  });

  it("falls back when invoke throws", async () => {
    const { client } = fakeClient({
      invoke: async () => {
        throw new TypeError("Network request failed");
      },
      rows: { data: [prompt], error: null },
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "ok", prompt });
  });

  it("is unavailable when nothing is stored for today", async () => {
    const { client } = fakeClient({
      invoke: [{ data: null, error: httpError(404) }],
      rows: { data: [], error: null },
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the table doesn't exist yet", async () => {
    const { client } = fakeClient({
      invoke: [{ data: null, error: httpError(404) }],
      rows: { data: null, error: { code: "42P01", message: 'relation "daily_prompts" does not exist' } },
    });
    expect(await fetchTodaysPrompt(client, NOW)).toEqual({ status: "unavailable" });
  });
});

describe("answerDailyPrompt", () => {
  it("sends the prompt id and answer to the RPC", async () => {
    const { client, raw } = fakeClient({ rpc: [{ error: null }] });
    expect(await answerDailyPrompt("p1", 4, client)).toEqual({ ok: true });
    expect(raw.rpc).toHaveBeenCalledWith("answer_daily_prompt", { prompt_id: "p1", p_answer: 4 });
  });

  it.each([
    ["prompt already answered", "already_answered"],
    ["prompt not found", "not_found"],
    ["answer does not match the canonical schema for trait tidiness_scale", "invalid_answer"],
    ["something unexpected", "unknown"],
  ])("maps %j to %s with a friendly message", async (message, reason) => {
    const { client } = fakeClient({ rpc: [{ error: { message, code: "P0001" } }] });
    const result = await answerDailyPrompt("p1", "saver", client);
    expect(result).toMatchObject({ ok: false, reason });
    if (!result.ok) expect(result.message).not.toContain(message);
  });

  it("refreshes and retries once when the JWT expired", async () => {
    const { client, raw } = fakeClient({
      rpc: [{ error: { message: "JWT expired", code: "PGRST301" }, status: 401 }, { error: null }],
      refresh: { session: { access_token: "new" }, error: null },
    });
    expect(await answerDailyPrompt("p1", 2, client)).toEqual({ ok: true });
    expect(raw.rpc).toHaveBeenCalledTimes(2);
  });

  it("returns unauthenticated when the refresh fails", async () => {
    const { client, raw } = fakeClient({
      rpc: [{ error: { message: "JWT expired", code: "PGRST301" }, status: 401 }],
      refresh: { session: null, error: { message: "no session" } },
    });
    expect(await answerDailyPrompt("p1", 2, client)).toMatchObject({ ok: false, reason: "unauthenticated" });
    expect(raw.rpc).toHaveBeenCalledTimes(1);
  });

  it("treats a thrown network error as unknown", async () => {
    const { client, raw } = fakeClient({});
    raw.rpc.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await answerDailyPrompt("p1", 2, client)).toMatchObject({ ok: false, reason: "unknown" });
  });
});

describe("queue staleness flag", () => {
  beforeEach(() => {
    consumeQueueStale();
  });

  it("is consumed exactly once", () => {
    expect(consumeQueueStale()).toBe(false);
    markQueueStale();
    expect(consumeQueueStale()).toBe(true);
    expect(consumeQueueStale()).toBe(false);
  });
});
