import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { data?: unknown; error?: unknown; count?: number | null };

const mocks = vi.hoisted(() => ({
  answers: new Map<string, () => Answer>(),
  inserts: [] as Array<{ table: string; row: unknown }>,
  updates: [] as Array<{ table: string; row: unknown }>,
  audit: vi.fn(),
  deliver: vi.fn(),
  order: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({
  writeAuditEvent: async (event: { action: string }) => {
    mocks.order.push(`audit:${event.action}`);
    return mocks.audit(event);
  },
}));
vi.mock("@/lib/email/deliver", () => ({ deliverEmail: mocks.deliver }));
vi.mock("@/lib/data/freelancers", () => ({ fetchActiveBookableRealProfiles: async () => [] }));

/**
 * Ein Bauchladen je Tabelle: Jede Kettenmethode gibt die Kette zurück, das
 * Ende liefert die hinterlegte Antwort. `insert` und `update` werden
 * mitgeschrieben, damit sich prüfen lässt, was angelegt wurde.
 */
function table(name: string) {
  let mode: "read" | "insert" | "update" = "read";
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "insert") {
          return (row: unknown) => {
            mode = "insert";
            mocks.order.push(`insert:${name}`);
            mocks.inserts.push({ table: name, row });
            return proxy;
          };
        }
        if (key === "update") {
          return (row: unknown) => {
            mode = "update";
            mocks.updates.push({ table: name, row });
            return proxy;
          };
        }
        const answer = () => mocks.answers.get(`${name}:${mode}`)?.() ?? { data: null, error: null, count: 0 };
        if (key === "then") {
          return (...args: Parameters<Promise<unknown>["then"]>) => Promise.resolve(answer()).then(...args);
        }
        if (key === "maybeSingle" || key === "single") return async () => answer();
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ from: (name: string) => table(name) }),
}));

import { assignFreelancer, createMandate } from "@/lib/placement/mandates";

const PROJECT = "33333333-0000-4000-8000-000000000001";
const USER = "11111111-1111-4111-8111-111111111111";
const MANDATE = "44444444-0000-4000-8000-000000000001";
const PROFILE = "22222222-2222-4222-8222-222222222222";

const contact = { email: "kunde@firma.invalid", company: "Firma GmbH", name: "Kim", phone: null };

beforeEach(() => {
  mocks.answers.clear();
  mocks.inserts.length = 0;
  mocks.updates.length = 0;
  mocks.order.length = 0;
  mocks.audit.mockReset().mockResolvedValue("trace");
  mocks.deliver.mockReset().mockResolvedValue({ delivered: true });
  process.env.CONTACT_NOTIFICATION_EMAIL = "betrieb@x-portal.invalid";
  mocks.answers.set("projects:read", () => ({ data: { id: PROJECT, title: "AI Agent für den Kundenservice", structured_brief: null }, error: null }));
  mocks.answers.set("search_mandates:read", () => ({ data: null, error: null, count: 0 }));
  mocks.answers.set("search_mandates:insert", () => ({ data: { id: MANDATE, status: "open" }, error: null }));
});

describe("creating a mandate", () => {
  it("records the consent before the mandate and tells the operator", async () => {
    const result = await createMandate({ userId: USER, isGuest: true, projectId: PROJECT, contact, note: "Start im November", siteUrl: "https://x-portal.eu" });

    expect(result.created).toBe(true);
    expect(mocks.order.slice(0, 2)).toEqual(["audit:placement_terms_accepted", "insert:search_mandates"]);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "placement_terms_accepted",
        targetType: "search_mandate",
        required: true,
        metadata: expect.objectContaining({ mandate: true, guest: true, version: expect.any(String) }),
      }),
    );
    const inserted = mocks.inserts.find((entry) => entry.table === "search_mandates")?.row as Record<string, unknown>;
    expect(inserted).toMatchObject({ project_id: PROJECT, owner_user_id: USER, contact_email: "kunde@firma.invalid", note: "Start im November" });
    expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({ kind: "transactional", subject: "Suchauftrag: AI Agent für den Kundenservice" }));
  });

  it("returns the open mandate instead of a second one", async () => {
    mocks.answers.set("search_mandates:read", () => ({ data: { id: MANDATE, status: "in_progress" }, error: null }));
    const result = await createMandate({ userId: USER, isGuest: false, projectId: PROJECT, contact, note: null, siteUrl: "https://x-portal.eu" });
    expect(result).toMatchObject({ created: false, mandate: { id: MANDATE, status: "in_progress" } });
    expect(mocks.inserts).toHaveLength(0);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("refuses a project that is not the caller's", async () => {
    mocks.answers.set("projects:read", () => ({ data: null, error: null }));
    await expect(
      createMandate({ userId: USER, isGuest: true, projectId: PROJECT, contact, note: null, siteUrl: "https://x-portal.eu" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("assigning a freelancer", () => {
  beforeEach(() => {
    mocks.answers.set("search_mandates:read", () => ({
      data: {
        id: MANDATE,
        project_id: PROJECT,
        owner_user_id: USER,
        contact_email: "kunde@firma.invalid",
        contact_company: "Firma GmbH",
        contact_name: "Kim",
        status: "open",
        created_at: "2026-10-02T09:00:00.000Z",
      },
      error: null,
    }));
    mocks.answers.set("freelancer_profiles:read", () => ({ data: { id: PROFILE }, error: null }));
    mocks.answers.set("intro_bookings:read", () => ({ data: null, error: null }));
    mocks.answers.set("intro_bookings:insert", () => ({ data: null, error: null }));
    mocks.answers.set("search_mandates:update", () => ({ data: null, error: null }));
  });

  it("creates an ordinary request waiting for introduction, with the mandate's consent time", async () => {
    const { requestId } = await assignFreelancer(MANDATE, PROFILE, "admin-1");
    const booking = mocks.inserts.find((entry) => entry.table === "intro_bookings")?.row as Record<string, unknown>;
    expect(booking).toMatchObject({
      id: requestId,
      project_id: PROJECT,
      owner_user_id: USER,
      freelancer_profile_id: PROFILE,
      match_id: null,
      status: "manual_review",
      intro_policy_snapshot: "manual_approval",
      explicit_confirmation_at: "2026-10-02T09:00:00.000Z",
      contact_email: "kunde@firma.invalid",
      contact_company: "Firma GmbH",
    });
    expect(mocks.updates.find((entry) => entry.table === "search_mandates")?.row).toMatchObject({ status: "in_progress", handled_by: "admin-1" });
  });

  it("refuses a closed mandate, an unavailable profile and a freelancer already requested", async () => {
    mocks.answers.set("search_mandates:read", () => ({ data: { id: MANDATE, status: "closed" }, error: null }));
    await expect(assignFreelancer(MANDATE, PROFILE, "admin-1")).rejects.toMatchObject({ status: 409 });

    mocks.answers.set("search_mandates:read", () => ({ data: { id: MANDATE, project_id: PROJECT, status: "open", created_at: "2026-10-02T09:00:00Z", contact_email: "a@b.invalid" }, error: null }));
    mocks.answers.set("freelancer_profiles:read", () => ({ data: null, error: null }));
    await expect(assignFreelancer(MANDATE, PROFILE, "admin-1")).rejects.toMatchObject({ status: 409 });

    mocks.answers.set("freelancer_profiles:read", () => ({ data: { id: PROFILE }, error: null }));
    mocks.answers.set("intro_bookings:read", () => ({ data: { id: "schon-da" }, error: null }));
    await expect(assignFreelancer(MANDATE, PROFILE, "admin-1")).rejects.toMatchObject({ status: 409 });
    expect(mocks.inserts.filter((entry) => entry.table === "intro_bookings")).toHaveLength(0);
  });
});
