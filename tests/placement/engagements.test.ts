import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(),
  answers: new Map<string, unknown[]>(),
  writes: [] as { table: string; kind: "insert" | "update"; values: unknown; filters: [string, unknown][] }[],
  users: new Map<string, { email: string | null; user_metadata?: Record<string, unknown> }>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));

/**
 * Jede Tabelle antwortet der Reihe nach mit dem, was für sie hinterlegt ist.
 * Schreibende Aufrufe merken sich Werte und Filter.
 */
function table(name: string) {
  let write: (typeof mocks.writes)[number] | null = null;
  const next = () => {
    const queue = mocks.answers.get(name) ?? [];
    return queue.length ? queue.shift() : { data: null, error: null };
  };
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (...args: Parameters<Promise<unknown>["then"]>) => Promise.resolve(next()).then(...args);
      }
      if (prop === "maybeSingle" || prop === "single") return async () => next();
      if (prop === "update" || prop === "insert") {
        return (values: unknown) => {
          write = { table: name, kind: prop, values, filters: [] };
          mocks.writes.push(write);
          return proxy;
        };
      }
      if (prop === "eq") {
        return (column: string, value: unknown) => {
          write?.filters.push([column, value]);
          return proxy;
        };
      }
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (name: string) => table(name),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: mocks.users.get(id) ?? null }, error: null }),
      },
    },
  }),
}));

import { mintAnswerToken } from "@/lib/placement/answer-token";
import {
  recordAnswer,
  recordEngagement,
  recordFeeStatus,
  sendDueFollowUps,
} from "@/lib/placement/engagements";

const REQUEST = "66666666-6666-4666-8666-666666666666";
const INTRO = {
  id: REQUEST,
  status: "ready_to_book",
  project_id: "project-1",
  owner_user_id: "client-1",
  freelancer_profile_id: "profile-1",
  confirmed_at: "2026-10-01T10:00:00.000Z",
  outcome: null,
  follow_up_count: 0,
};

function given(tableName: string, ...answers: unknown[]) {
  mocks.answers.set(tableName, answers.map((data) => ({ data, error: null })));
}

function writesTo(tableName: string) {
  return mocks.writes.filter((write) => write.table === tableName);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a-long-enough-secret-for-the-tests-0123456789");
  mocks.answers.clear();
  mocks.writes.length = 0;
  mocks.users.clear();
  mocks.users.set("client-1", { email: "erika@firma.example", user_metadata: { display_name: "Erika Muster" } });
  mocks.users.set("freelancer-1", { email: "mira@example.org" });
  mocks.deliver.mockResolvedValue({ delivered: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("recording an engagement", () => {
  // Der Kunde hat einer Fassung zugestimmt; deren Zahlen gelten, auch wenn
  // die Bedingungen inzwischen anders lauten.
  it("computes the fee from the terms the client accepted", async () => {
    given("intro_bookings", INTRO, null);
    given("engagements", null, null);
    given("audit_events", { metadata: { version: "vermittlung-alt", feePercent: 8, maxFeeDays: 40 } });

    const result = await recordEngagement(REQUEST, { dayRateMinor: 60_000, projectDays: 60, startsOn: "2026-11-02" });

    expect(result).toEqual({ feeMinor: 192_000, termsVersion: "vermittlung-alt", clientUserId: "client-1" });
    const insert = writesTo("engagements")[0];
    expect(insert.kind).toBe("insert");
    expect(insert.values).toMatchObject({
      intro_booking_id: REQUEST,
      day_rate_minor: 60_000,
      project_days: 60,
      contract_value_minor: 3_600_000,
      fee_minor: 192_000,
      fee_status: "open",
      confirmation_source: "operator",
    });
    expect(writesTo("intro_bookings")[0].values).toMatchObject({ outcome: "engaged", outcome_source: "operator" });
  });

  it("refuses a second engagement for the same introduction", async () => {
    given("intro_bookings", INTRO);
    given("engagements", { id: "engagement-1", fee_status: "open", fee_minor: 1 });

    await expect(
      recordEngagement(REQUEST, { dayRateMinor: 60_000, projectDays: 60, startsOn: "2026-11-02" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(writesTo("engagements")).toEqual([]);
  });

  it("refuses a request that was never introduced", async () => {
    given("intro_bookings", { ...INTRO, status: "manual_review" });

    await expect(
      recordEngagement(REQUEST, { dayRateMinor: 60_000, projectDays: 60, startsOn: "2026-11-02" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("invoice status", () => {
  it("moves from open to invoiced with a number, and only from the state it saw", async () => {
    given("intro_bookings", INTRO);
    given("engagements", { id: "engagement-1", fee_status: "open", fee_minor: 355_200 }, { id: "engagement-1" });

    const result = await recordFeeStatus(REQUEST, { status: "invoiced", reference: "RE-2026-001" });

    expect(result).toEqual({ feeMinor: 355_200, clientUserId: "client-1" });
    const update = writesTo("engagements")[0];
    expect(update.values).toMatchObject({ fee_status: "invoiced", invoice_reference: "RE-2026-001" });
    expect(update.filters).toContainEqual(["fee_status", "open"]);
  });

  it("does not invoice twice", async () => {
    given("intro_bookings", INTRO);
    given("engagements", { id: "engagement-1", fee_status: "invoiced", fee_minor: 355_200 });

    await expect(recordFeeStatus(REQUEST, { status: "invoiced", reference: "RE-2" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("follow-ups", () => {
  it("sends due follow-ups to both sides and counts them once", async () => {
    given("intro_bookings", [INTRO], { id: REQUEST });
    given("engagements", []);
    given("freelancer_profiles", { display_name: "Mira Falk", role_title: "Data Engineer", owner_user_id: "freelancer-1" });
    given("projects", { title: "Datenplattform" });

    const result = await sendDueFollowUps("https://x-portal.eu", new Date("2026-10-16T10:00:00.000Z"));

    expect(result).toEqual({ sent: 2, failed: 0 });
    const claim = writesTo("intro_bookings")[0];
    expect(claim.values).toMatchObject({ follow_up_count: 1 });
    expect(claim.filters).toContainEqual(["follow_up_count", 0]);
    const [toClient, toFreelancer] = mocks.deliver.mock.calls.map(([message]) => message);
    expect(toClient.to).toBe("erika@firma.example");
    expect(toClient.text).toContain("/vermittlung/antwort?t=");
    expect(toFreelancer.to).toBe("mira@example.org");
  });

  it("sends nothing before 14 days", async () => {
    given("intro_bookings", [INTRO]);
    given("engagements", []);

    const result = await sendDueFollowUps("https://x-portal.eu", new Date("2026-10-10T10:00:00.000Z"));

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("refuses to send without answer links", async () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");

    await expect(sendDueFollowUps("https://x-portal.eu")).rejects.toMatchObject({ status: 503 });
  });
});

describe("answers from the email", () => {
  it("records a reported engagement and tells the operator", async () => {
    const token = mintAnswerToken(REQUEST, "client")!;
    given("intro_bookings", INTRO);
    given("engagements", null);
    given("freelancer_profiles", { display_name: "Mira Falk" });
    given("projects", { title: "Datenplattform" });

    const result = await recordAnswer(token, "engaged", "https://x-portal.eu");

    expect(result).toEqual({ recorded: true, requestId: REQUEST, clientUserId: "client-1", role: "client" });
    expect(writesTo("intro_bookings")[0].values).toMatchObject({ outcome: "engaged", outcome_source: "client" });
    expect(mocks.deliver.mock.calls[0][0].subject).toBe("Beauftragung gemeldet: Mira Falk");
  });

  it("keeps a reported engagement when a later answer says otherwise", async () => {
    const token = mintAnswerToken(REQUEST, "freelancer")!;
    given("intro_bookings", { ...INTRO, outcome: "engaged" });
    given("engagements", null);

    const result = await recordAnswer(token, "talking", "https://x-portal.eu");

    expect(result.recorded).toBe(false);
    expect(writesTo("intro_bookings")).toEqual([]);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("rejects a forged link", async () => {
    await expect(recordAnswer("abc.def", "engaged", "https://x-portal.eu")).rejects.toMatchObject({ status: 404 });
  });
});
