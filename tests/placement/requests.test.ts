import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliver: vi.fn(),
  answers: new Map<string, unknown[]>(),
  updates: [] as { table: string; values: unknown; filters: [string, unknown][] }[],
  users: new Map<string, { email: string | null; user_metadata?: Record<string, unknown> }>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));

/**
 * Jede Tabelle antwortet der Reihe nach mit dem, was für sie hinterlegt ist.
 * Ein `update` merkt sich Werte und Filter, damit der Test prüfen kann, dass
 * nur aus „wartet“ heraus gewechselt wird.
 */
function table(name: string) {
  let update: { table: string; values: unknown; filters: [string, unknown][] } | null = null;
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
      if (prop === "update") {
        return (values: unknown) => {
          update = { table: name, values, filters: [] };
          mocks.updates.push(update);
          return proxy;
        };
      }
      if (prop === "eq") {
        return (column: string, value: unknown) => {
          update?.filters.push([column, value]);
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

import { approvePlacementRequest, declinePlacementRequest } from "@/lib/placement/requests";

const REQUEST = "66666666-6666-4666-8666-666666666666";
const BOOKING = {
  id: REQUEST,
  status: "manual_review",
  requested_at: "2026-09-28T10:00:00.000Z",
  confirmed_at: null,
  cancelled_at: null,
  project_id: "project-1",
  owner_user_id: "client-1",
  freelancer_profile_id: "profile-1",
};
const PROFILE = {
  id: "profile-1",
  display_name: "Mira Falk",
  role_title: "Senior Data Engineer",
  booking_url: "https://calendly.com/mira",
  owner_user_id: "freelancer-1",
};

function given(tableName: string, ...answers: unknown[]) {
  mocks.answers.set(tableName, answers.map((data) => ({ data, error: null })));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.answers.clear();
  mocks.updates.length = 0;
  mocks.users.clear();
  mocks.users.set("client-1", { email: "erika@firma.example", user_metadata: { display_name: "Erika Muster" } });
  mocks.users.set("freelancer-1", { email: "mira@example.org" });
  mocks.deliver.mockResolvedValue({ delivered: true });
  given("freelancer_profiles", PROFILE);
  given("projects", { id: "project-1", title: "Datenplattform" });
});

describe("introducing a client to a freelancer", () => {
  it("switches only out of waiting and writes to both sides", async () => {
    given("intro_bookings", BOOKING, { id: REQUEST });

    const result = await approvePlacementRequest(REQUEST, "https://x-portal.eu");

    expect(result).toEqual({
      freelancerReachable: true,
      freelancerNotified: true,
      clientNotified: true,
      hasCalendar: true,
    });
    const update = mocks.updates[0];
    expect(update.values).toMatchObject({ status: "ready_to_book", booking_url: "https://calendly.com/mira" });
    expect(update.filters).toContainEqual(["status", "manual_review"]);
    const recipients = mocks.deliver.mock.calls.map(([message]) => message.to);
    expect(recipients).toEqual(["mira@example.org", "erika@firma.example"]);
  });

  // 59 von 70 Profilen hatten am 28.09.2026 keine Adresse im System.
  it("still introduces the client when the freelancer cannot be mailed, and says so", async () => {
    given("intro_bookings", BOOKING, { id: REQUEST });
    given("freelancer_profiles", { ...PROFILE, owner_user_id: null });

    const result = await approvePlacementRequest(REQUEST, "https://x-portal.eu");

    expect(result.freelancerReachable).toBe(false);
    expect(result.freelancerNotified).toBe(false);
    expect(mocks.deliver).toHaveBeenCalledTimes(1);
    expect(mocks.deliver.mock.calls[0][0].text).not.toContain("ebenfalls erhalten");
  });

  it("refuses a request that is already handled", async () => {
    given("intro_bookings", { ...BOOKING, status: "ready_to_book" });

    await expect(approvePlacementRequest(REQUEST, "https://x-portal.eu")).rejects.toMatchObject({ status: 409 });
    expect(mocks.updates).toEqual([]);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  // Zwei Klicks gleichzeitig: Nur einer wechselt den Status, nur einer mailt.
  it("sends nothing when another click won the race", async () => {
    given("intro_bookings", BOOKING, null);

    await expect(approvePlacementRequest(REQUEST, "https://x-portal.eu")).rejects.toMatchObject({ status: 409 });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("declines with a reason and tells the client", async () => {
    given("intro_bookings", BOOKING, { id: REQUEST });

    const result = await declinePlacementRequest(REQUEST, "Sie ist bis Dezember ausgebucht.", "https://x-portal.eu");

    expect(result).toEqual({ clientNotified: true });
    expect(mocks.updates[0].values).toMatchObject({ status: "cancelled" });
    expect(mocks.deliver.mock.calls[0][0].text).toContain("bis Dezember ausgebucht");
  });
});
