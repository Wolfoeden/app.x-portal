import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue("trace"),
  buildShortlist: vi.fn((): { matches: unknown[] } => ({ matches: [] })),
  execute: vi.fn(),
  completeExternalSearch: vi.fn(),
  fetchProfiles: vi.fn().mockResolvedValue([]),
  getExternalSearchResult: vi.fn(),
  getProductCreditSnapshot: vi.fn(),
  search: vi.fn(),
  reserveProductCredits: vi.fn(),
  settleProductCredits: vi.fn(),
  eqCalls: [] as Array<[string, unknown]>,
  project: null as Record<string, unknown> | null,
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: null as string | null,
    isAnonymous: false,
    isAdmin: false,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: () => Promise.resolve(mocks.user),
}));
vi.mock("@/lib/data/freelancers", () => ({
  fetchActiveBookableRealProfiles: mocks.fetchProfiles,
}));
vi.mock("@/lib/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/domain")>();
  return { ...actual, buildShortlist: mocks.buildShortlist };
});
vi.mock("@/lib/openai/external-freelancer-search", () => ({
  estimateExternalSearchTokenCeiling: () => ({
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    model: "gpt-5.4-nano-2026-03-17",
  }),
  searchExternalFreelancers: mocks.search,
}));
vi.mock("@/lib/ai/gateway", () => ({
  executeTrackedAiRequest: mocks.execute,
}));
vi.mock("@/lib/ai/product-entitlements", () => ({
  EXTERNAL_FREELANCER_SEARCH_CREDITS: 30,
  PRODUCT_CREDIT_EURO_PER_UNIT: "0.0166666667",
  completeExternalSearch: mocks.completeExternalSearch,
  getExternalSearchResult: mocks.getExternalSearchResult,
  getProductCreditSnapshot: mocks.getProductCreditSnapshot,
  reserveProductCredits: mocks.reserveProductCredits,
  settleProductCredits: mocks.settleProductCredits,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table !== "projects") throw new Error(`Unexpected table: ${table}`);
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.eqCalls.push([column, value]);
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({ data: mocks.project, error: null }),
      };
      return query;
    },
  }),
}));

import { parseFallbackBrief } from "@/lib/domain";
import { POST } from "@/app/api/freelancer-search/route";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

const PROJECT_ID = "00000000-0000-4000-8000-000000000010";

function project() {
  return {
    id: PROJECT_ID,
    owner_user_id: "00000000-0000-4000-8000-000000000001",
    title: "React project",
    original_request: "React freelancer, remote",
    structured_brief: parseFallbackBrief("React freelancer, remote"),
    brief_status: "ready",
    status: "matching",
    created_at: "2026-08-12T08:00:00.000Z",
    updated_at: "2026-08-12T08:00:00.000Z",
  };
}

function request(
  origin = "https://x-portal.eu",
  projectId = PROJECT_ID,
) {
  return new Request("https://x-portal.eu/api/freelancer-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-forwarded-for": "203.0.113.5",
    },
    body: JSON.stringify({
      projectId,
      requestId: "search-request-1",
    }),
  });
}

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.IP_HASH_SECRET = "a-secure-test-secret-that-is-long-enough";
  process.env.NEXT_PUBLIC_SITE_URL = "https://x-portal.eu";
  mocks.project = project();
  mocks.eqCalls.length = 0;
  mocks.audit.mockClear();
  mocks.fetchProfiles.mockClear();
  mocks.buildShortlist.mockReset();
  mocks.buildShortlist.mockReturnValue({ matches: [] });
  mocks.search.mockReset();
  mocks.execute.mockReset();
  mocks.completeExternalSearch.mockReset();
  mocks.getExternalSearchResult.mockReset();
  mocks.getProductCreditSnapshot.mockReset();
  mocks.reserveProductCredits.mockReset();
  mocks.settleProductCredits.mockReset();
  mocks.reserveProductCredits.mockResolvedValue({
    allowed: true,
    reason: "reserved",
    reservationId: "00000000-0000-4000-8000-000000000030",
    balance: 100,
    reserved: 30,
    available: 70,
  });
  mocks.settleProductCredits.mockResolvedValue({
    balance: 70,
    reserved: 0,
    available: 70,
  });
  mocks.getExternalSearchResult.mockResolvedValue(null);
  mocks.getProductCreditSnapshot.mockResolvedValue({
    balance: 70,
    reserved: 0,
    available: 70,
  });
  mocks.completeExternalSearch.mockImplementation(async (input) => ({
    recorded: true,
    reason: "charged",
    candidates: input.candidates,
    balance: 70,
    reserved: 0,
    available: 70,
  }));
  mocks.execute.mockImplementation(async (input) => {
    const operation = await input.operation(true);
    return {
      value: operation.value,
      quota: {
        allowed: true,
        reason: "reserved",
        retryAfterSeconds: null,
        reservationId: "00000000-0000-4000-8000-000000000020",
        credits: null,
      },
      credits: null,
    };
  });
  mocks.search.mockResolvedValue({
    candidates: [],
    mode: "openai",
    providerAttempted: true,
    provider: {
      requestedModel: "gpt-5.4-nano-2026-03-17",
      model: "gpt-5.4-nano-2026-03-17",
      responseId: "resp_search_empty",
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    },
    searchTrace: {
      queries: ["React freelancer booking"],
      consultedSourceCount: 2,
      returnedCandidateCount: 0,
    },
  });
  resetRateLimitsForTests();
});

afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.IP_HASH_SECRET;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("POST /api/freelancer-search", () => {
  it("accepts historical PostgreSQL UUIDs without RFC version bits", async () => {
    mocks.project = {
      ...project(),
      id: "00000000-0000-0000-0000-000000000010",
    };

    const response = await POST(
      request(
        "https://x-portal.eu",
        "00000000-0000-0000-0000-000000000010",
      ),
    );

    expect(response.status).not.toBe(400);
  });

  it("rejects cross-origin writes before provider work", async () => {
    const response = await POST(request("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("enforces project ownership in the database lookup", async () => {
    mocks.project = null;
    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.eqCalls).toContainEqual(["id", PROJECT_ID]);
    expect(mocks.eqCalls).toContainEqual([
      "owner_user_id",
      "00000000-0000-4000-8000-000000000001",
    ]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not spend on web search when an internal match now exists", async () => {
    mocks.buildShortlist.mockReturnValue({ matches: [{}] });
    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "external_freelancer_search_denied_internal_match",
        outcome: "denied",
      }),
    );
  });

  it("returns external results separately with an explicit disclosure", async () => {
    mocks.search.mockResolvedValue({
      candidates: [
        {
          displayName: "Anna Beispiel",
          role: "React Freelancer",
          summary: "Public profile summary",
          matchedRequirements: ["React"],
          knownGaps: ["Rate unknown"],
          profileUrl: "https://portfolio.example/anna",
          bookingUrl: "https://calendly.com/anna/30min",
          sourceUrls: [
            "https://portfolio.example/anna",
            "https://calendly.com/anna/30min",
          ],
          verificationStatus: "external_unverified",
        },
      ],
      mode: "openai",
      providerAttempted: true,
      provider: {
        requestedModel: "gpt-5.4-nano-2026-03-17",
        model: "gpt-5.4-nano-2026-03-17",
        responseId: "resp_search_one",
        inputTokens: 100,
        outputTokens: 40,
        totalTokens: 140,
      },
      searchTrace: {
        queries: ["React freelancer booking"],
        consultedSourceCount: 2,
        returnedCandidateCount: 1,
      },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].verificationStatus).toBe("external_unverified");
    expect(body.disclosure).toContain("nicht von XPORTAL geprüft");
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ allowProvider: true }),
    );
    expect(mocks.completeExternalSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        providerResponseId: "resp_search_one",
        actualModel: "gpt-5.4-nano-2026-03-17",
      }),
    );
  });

  it("restores an already-paid result without reserving or calling OpenAI again", async () => {
    mocks.getExternalSearchResult.mockResolvedValue({
      candidates: [
        {
          displayName: "Anna Beispiel",
          role: "React Freelancer",
          summary: "Public profile summary",
          matchedRequirements: ["React"],
          knownGaps: [],
          profileUrl: "https://portfolio.example/anna",
          bookingUrl: "https://calendly.com/anna/30min",
          sourceUrls: [
            "https://portfolio.example/anna",
            "https://calendly.com/anna/30min",
          ],
          verificationStatus: "external_unverified",
        },
      ],
      providerResponseId: "resp_existing",
      actualModel: "gpt-5.4-nano-2026-03-17",
      createdAt: "2026-08-13T12:00:00.000Z",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notice).toContain("ohne neue Belastung");
    expect(body.candidates).toHaveLength(1);
    expect(mocks.reserveProductCredits).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not call the provider when purchased credits are insufficient", async () => {
    mocks.reserveProductCredits.mockResolvedValue({
      allowed: false,
      reason: "insufficient_credits",
      reservationId: null,
      balance: 29,
      reserved: 0,
      available: 29,
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.code).toBe("insufficient_product_credits");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("releases the reservation when the provider result is not usable", async () => {
    mocks.search.mockResolvedValue({
      candidates: [],
      mode: "unavailable",
      providerAttempted: true,
      fallbackReason: "provider_timeout",
      searchTrace: {
        queries: [],
        consultedSourceCount: 0,
        returnedCandidateCount: 0,
      },
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.price.charged).toBe(false);
    expect(mocks.settleProductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "timeout" }),
    );
    expect(mocks.completeExternalSearch).not.toHaveBeenCalled();
  });

  it("requires an account before checking or reserving product credits", async () => {
    mocks.user.isAnonymous = true;
    try {
      const response = await POST(request());
      expect(response.status).toBe(401);
      expect(mocks.reserveProductCredits).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    } finally {
      mocks.user.isAnonymous = false;
    }
  });
});
