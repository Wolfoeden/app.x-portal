import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMonthlyAiUsageSnapshot: vi.fn(),
  getProductCreditSnapshot: vi.fn(),
  from: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/ai/product-entitlements", () => ({
  getMonthlyAiUsageSnapshot: mocks.getMonthlyAiUsageSnapshot,
  getProductCreditSnapshot: mocks.getProductCreditSnapshot,
  PRODUCT_CREDIT_EURO_PER_UNIT: 0.5,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ from: mocks.from }),
}));

import { loadWorkspaceBootstrap } from "@/lib/data/workspace";

const user = { id: "user-1", email: "a@example.com", isAnonymous: false, isAdmin: false };

/** Minimal stand-in for the chained PostgREST builder the loaders use. */
function table(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "is", "order"]) {
    builder[method] = () => builder;
  }
  builder.limit = () => Promise.resolve(result);
  return builder;
}

describe("workspace bootstrap", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("answers without touching the database when nobody is signed in", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const bootstrap = await loadWorkspaceBootstrap();

    expect(bootstrap.auth.authenticated).toBe(false);
    expect(bootstrap.auth.anonymous).toBe(true);
    expect(bootstrap.projects).toEqual([]);
    expect(bootstrap.collections).toEqual([]);
    expect(bootstrap.usage).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("keeps the chat list when the credit snapshot fails", async () => {
    // The point of the combined route: the sequential version put credits
    // ahead of everything, so a quota outage cost the user their chats too.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getMonthlyAiUsageSnapshot.mockRejectedValue(new Error("quota_down"));
    mocks.from.mockImplementation(() => table({ data: [], error: null }));

    const bootstrap = await loadWorkspaceBootstrap();

    expect(bootstrap.usage).toBeNull();
    expect(bootstrap.auth.authenticated).toBe(true);
    expect(bootstrap.projects).toEqual([]);
    expect(bootstrap.collections).toEqual([]);
  });

  it("keeps credits when a project read fails", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getMonthlyAiUsageSnapshot.mockResolvedValue({
      used: 1,
      reserved: 0,
      remaining: 9,
      limit: 10,
      periodStart: "2026-08-01T00:00:00.000Z",
    });
    mocks.getProductCreditSnapshot.mockResolvedValue(null);
    mocks.from.mockImplementation(() =>
      table({ data: null, error: { message: "boom" } }),
    );

    const bootstrap = await loadWorkspaceBootstrap();

    expect(bootstrap.usage?.freeUsage.remaining).toBe(9);
    expect(bootstrap.usage?.freeUsage.exhausted).toBe(false);
    expect(bootstrap.projects).toEqual([]);
  });

  it("resolves the session once, not once per section", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getMonthlyAiUsageSnapshot.mockResolvedValue({
      used: 0,
      reserved: 0,
      remaining: 10,
      limit: 10,
      periodStart: "2026-08-01T00:00:00.000Z",
    });
    mocks.getProductCreditSnapshot.mockResolvedValue(null);
    mocks.from.mockImplementation(() => table({ data: [], error: null }));

    await loadWorkspaceBootstrap();

    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
  });
});
