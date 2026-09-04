import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn().mockResolvedValue("trace"),
  buildShortlist: vi.fn(
    (): {
      status: "no_reliable_match" | "ranked" | "needs_clarification";
      matches: unknown[];
      partialMatches?: unknown[];
    } => ({
      status: "no_reliable_match",
      matches: [],
    }),
  ),
  execute: vi.fn(),
  storeExternalSearchResult: vi.fn(),
  fetchProfiles: vi.fn().mockResolvedValue([]),
  getExternalSearchResult: vi.fn(),
  getAiCreditSnapshot: vi.fn(),
  search: vi.fn(),
  /** Steuert, ob die Reservierung im Gateway bewilligt wird. */
  quotaAllowed: true,
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
  // Nicht durch eine Attrappe ersetzt: Dass die Kontaktadresse die Route nicht
  // verlässt, ist genau die Zusage, die hier geprüft werden soll. Ein
  // Platzhalter würde sie stillschweigend durchlassen.
  withoutContactEmail: (candidates: readonly Record<string, unknown>[]) =>
    candidates.map((candidate) => {
      const copy = { ...candidate };
      delete copy.contactEmail;
      return copy;
    }),
}));
vi.mock("@/lib/ai/gateway", () => ({
  executeTrackedAiRequest: mocks.execute,
}));
vi.mock("@/lib/ai/external-search-store", () => ({
  getExternalSearchResult: mocks.getExternalSearchResult,
  storeExternalSearchResult: mocks.storeExternalSearchResult,
}));
vi.mock("@/lib/ai/quota", () => ({
  getAiCreditSnapshot: mocks.getAiCreditSnapshot,
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

/** Ein Guthaben — dasselbe, aus dem auch Analyse und Chat bezahlt werden. */
const CREDITS = { total: 300, used: 30, reserved: 0, remaining: 270 };

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
  mocks.buildShortlist.mockReturnValue({
    status: "no_reliable_match",
    matches: [],
  });
  mocks.search.mockReset();
  mocks.execute.mockReset();
  mocks.storeExternalSearchResult.mockReset();
  mocks.getExternalSearchResult.mockReset();
  mocks.getAiCreditSnapshot.mockReset();
  mocks.quotaAllowed = true;
  mocks.getExternalSearchResult.mockResolvedValue(null);
  mocks.getAiCreditSnapshot.mockResolvedValue(CREDITS);
  mocks.storeExternalSearchResult.mockImplementation(async (input) => ({
    recorded: true,
    reason: "stored",
    candidates: input.candidates,
  }));
  // Bildet nach, was der echte Gateway tut: reservieren, den Anbieter nur bei
  // bewilligtem Halt aufrufen und einen Lauf ohne verwertbare Nutzung wieder
  // freigeben. Ohne diese Nachbildung würde der Test die Zusage „ein
  // Fehlschlag kostet nichts" gar nicht prüfen können.
  mocks.execute.mockImplementation(async (input) => {
    const operation = await input.operation(mocks.quotaAllowed);
    const charged =
      mocks.quotaAllowed &&
      operation.usage !== undefined &&
      operation.providerUsageDefinitelyZero !== true
        ? 30
        : 0;
    return {
      value: operation.value,
      quota: {
        allowed: mocks.quotaAllowed,
        reason: mocks.quotaAllowed ? "reserved" : "insufficient_credits",
        retryAfterSeconds: null,
        reservationId: mocks.quotaAllowed
          ? "00000000-0000-4000-8000-000000000020"
          : null,
        credits: CREDITS,
      },
      credits: CREDITS,
      creditsCharged: charged,
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
    mocks.buildShortlist.mockReturnValue({ status: "ranked", matches: [{}] });
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

  it("does not spend when the internal brief still needs clarification", async () => {
    mocks.buildShortlist.mockReturnValue({
      status: "needs_clarification",
      matches: [],
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("keine Credits belastet");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns external results separately with an explicit disclosure", async () => {
    mocks.buildShortlist.mockReturnValue({
      status: "no_reliable_match",
      matches: [],
      partialMatches: [{ recommendationRole: "partial" }],
    });
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
    expect(body.price).toEqual({ credits: 30, charged: true });
    expect(body.credits).toEqual(CREDITS);
    expect(mocks.storeExternalSearchResult).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        providerResponseId: "resp_search_one",
        actualModel: "gpt-5.4-nano-2026-03-17",
      }),
    );
  });

  it("liefert das bezahlte Ergebnis auch dann, wenn das Ablegen scheitert", async () => {
    // Der Kunde hat den Lauf bezahlt und bekommt sein Ergebnis. Verloren ist
    // nur die Wiederherstellbarkeit — und die gehoert ins Protokoll, nicht in
    // eine Fehlermeldung.
    mocks.storeExternalSearchResult.mockRejectedValue(new Error("db down"));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.price.charged).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "external_freelancer_search_result_not_stored",
        outcome: "failed",
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
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("fragt den Anbieter nicht, wenn das Guthaben nicht reicht", async () => {
    mocks.quotaAllowed = false;

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.code).toBe("insufficient_credits");
    expect(body.price).toEqual({ credits: 30 });
    // Der Gateway laeuft, ruft den Anbieter aber ausdruecklich nicht auf.
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ allowProvider: false }),
    );
    expect(mocks.storeExternalSearchResult).not.toHaveBeenCalled();
  });

  it("belastet nichts, wenn der Lauf kein verwertbares Ergebnis liefert", async () => {
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
    expect(mocks.storeExternalSearchResult).not.toHaveBeenCalled();
  });

  it("belastet nichts, wenn die Anbieterantwort nicht zuordenbar ist", async () => {
    // Ohne Antwort-Kennung laesst sich das Ergebnis weder ablegen noch spaeter
    // belegen. Berechnet wird es deshalb nicht.
    mocks.search.mockResolvedValue({
      candidates: [],
      mode: "openai",
      providerAttempted: true,
      provider: {
        requestedModel: "gpt-5.4-nano-2026-03-17",
        model: "gpt-5.4-nano-2026-03-17",
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      },
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
    expect(mocks.storeExternalSearchResult).not.toHaveBeenCalled();
  });

  it("requires an account before any credit is held", async () => {
    mocks.user.isAnonymous = true;
    try {
      const response = await POST(request());
      expect(response.status).toBe(401);
      expect(mocks.execute).not.toHaveBeenCalled();
    } finally {
      mocks.user.isAnonymous = false;
    }
  });
});
