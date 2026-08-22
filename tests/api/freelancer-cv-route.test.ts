import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProjectRow = { id: string; brief_status: string };
type ShortlistRow = { id: string; result_status: string | null };
type MatchRow = { id: string; evaluation_snapshot: unknown };

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  createSignedUrl: vi.fn(),
  eqCalls: [] as Array<[string, string, unknown]>,
  fetchDocument: vi.fn(),
  fromCalls: [] as string[],
  info: vi.fn(),
  limitCalls: [] as Array<[string, number]>,
  match: null as MatchRow | null,
  orderCalls: [] as Array<[
    string,
    string,
    { ascending?: boolean } | undefined,
  ]>,
  project: null as ProjectRow | null,
  requireUser: vi.fn(),
  shortlist: null as ShortlistRow | null,
  storageFromCalls: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: mocks.requireUser,
}));
vi.mock("@/lib/data/freelancer-cvs", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/data/freelancer-cvs")
  >();
  return {
    ...actual,
    fetchDownloadableCvDocument: mocks.fetchDocument,
    safeCvDownloadFilename: () => "freelancer-cv.pdf",
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      mocks.fromCalls.push(table);
      if (!(["projects", "shortlists", "matches"] as const).includes(table as never)) {
        throw new Error(`Unexpected table: ${table}`);
      }
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          mocks.eqCalls.push([table, column, value]);
          return query;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          mocks.orderCalls.push([table, column, options]);
          return query;
        },
        limit: (value: number) => {
          mocks.limitCalls.push([table, value]);
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "projects"
                ? mocks.project
                : table === "shortlists"
                  ? mocks.shortlist
                  : mocks.match,
            error: null,
          }),
      };
      return query;
    },
    storage: {
      from: (bucket: string) => {
        mocks.storageFromCalls.push(bucket);
        return {
          createSignedUrl: mocks.createSignedUrl,
          info: mocks.info,
        };
      },
    },
  }),
}));

import { POST } from "@/app/api/freelancers/[id]/cv/route";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const PROFILE_ID = "20000000-0000-4000-8000-000000000001";
const MATCH_ID = "30000000-0000-4000-8000-000000000001";
const PROJECT_ID = "40000000-0000-4000-8000-000000000001";
const SHORTLIST_ID = "50000000-0000-4000-8000-000000000001";
const GENERIC_UNAVAILABLE = { error: "Der CV ist nicht verfügbar." };

function evaluationSnapshot(
  recommendationRole: "primary" | "alternative" | "partial" = "primary",
) {
  return {
    schemaVersion: 1,
    recommendationRole,
    fitScore: 90,
    coreCoverage: 85,
    requirementAssessments: [],
    scoreBreakdown: {
      scoreVersion: "freelancer-score-v1",
      fitScoreBasisPoints: 9_000,
      coreCoverageBasisPoints: 8_500,
      optionalCoverageBasisPoints: null,
      categoricalFitBasisPoints: null,
      availabilityFitBasisPoints: 10_000,
      commercialFitBasisPoints: null,
      evidenceConfidenceBasisPoints: 8_000,
      minimumCoreCoverageBasisPoints: 7_000,
    },
  };
}

function request(
  body: unknown = { projectId: PROJECT_ID },
  origin: string | null = "https://x-portal.eu",
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "x-forwarded-for": "203.0.113.25",
  });
  if (origin) headers.set("Origin", origin);
  return new Request(
    `https://x-portal.eu/api/freelancers/${PROFILE_ID}/cv`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );
}

function context(id = PROFILE_ID) {
  return { params: Promise.resolve({ id }) };
}

async function expectGenericUnavailable(response: Response) {
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(GENERIC_UNAVAILABLE);
  expect(response.headers.get("cache-control")).toContain("no-store");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eqCalls.length = 0;
  mocks.fromCalls.length = 0;
  mocks.limitCalls.length = 0;
  mocks.orderCalls.length = 0;
  mocks.storageFromCalls.length = 0;
  resetRateLimitsForTests();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.IP_HASH_SECRET = "a-secure-test-secret-that-is-long-enough";
  mocks.requireUser.mockResolvedValue({
    id: USER_ID,
    email: "account@example.test",
    isAnonymous: false,
    isAdmin: false,
  });
  mocks.audit.mockResolvedValue("trace-id");
  mocks.project = { id: PROJECT_ID, brief_status: "ready" };
  mocks.shortlist = { id: SHORTLIST_ID, result_status: "ranked" };
  mocks.match = {
    id: MATCH_ID,
    evaluation_snapshot: evaluationSnapshot("primary"),
  };
  mocks.fetchDocument.mockResolvedValue({
    profileId: PROFILE_ID,
    storageBucket: "freelancer-cvs",
    storagePath: `${PROFILE_ID}/cv-v1.pdf`,
    originalFilename: "Lebenslauf.pdf",
    mimeType: "application/pdf",
    byteSize: 1_000,
    version: 1,
  });
  mocks.info.mockResolvedValue({
    data: {
      bucketId: "freelancer-cvs",
      contentType: "application/pdf",
      size: 1_000,
      cacheControl: "max-age=60",
    },
    error: null,
  });
  mocks.createSignedUrl.mockResolvedValue({
    data: {
      signedUrl:
        "https://example.supabase.co/storage/v1/object/sign/freelancer-cvs/cv?token=test-token",
    },
    error: null,
  });
});

afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.IP_HASH_SECRET;
});

describe("POST /api/freelancers/[id]/cv", () => {
  it("rejects a cross-origin POST before authentication or database access", async () => {
    const response = await POST(request(undefined, "https://attacker.example"), context());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Anfrage abgelehnt." });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.fromCalls).toEqual([]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("rejects a POST without an Origin header before authentication", async () => {
    const response = await POST(request(undefined, null), context());

    expect(response.status).toBe(403);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.fromCalls).toEqual([]);
  });

  it("blocks an anonymous session before parsing identifiers or touching the database", async () => {
    mocks.requireUser.mockResolvedValue({
      id: USER_ID,
      email: null,
      isAnonymous: true,
      isAdmin: false,
    });

    const response = await POST(request({ projectId: "not-a-uuid" }), context("not-a-uuid"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.fromCalls).toEqual([]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER_ID,
        action: "freelancer_cv_download_denied",
        outcome: "denied",
        metadata: { reason: "anonymous_session" },
      }),
    );
  });

  it("rejects an invalid profile id without database or storage access", async () => {
    const response = await POST(request(), context("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(mocks.fromCalls).toEqual([]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("requires a same-origin JSON body containing a valid project id", async () => {
    const response = await POST(request({ projectId: "not-a-uuid" }), context());

    expect(response.status).toBe(400);
    expect(mocks.fromCalls).toEqual([]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it.each(["primary", "alternative"] as const)(
    "authorizes a valid %s snapshot only through the owned project's latest ranked shortlist",
    async (role) => {
      mocks.match = {
        id: MATCH_ID,
        evaluation_snapshot: evaluationSnapshot(role),
      };

      const response = await POST(request(), context());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        downloadUrl:
          "https://example.supabase.co/storage/v1/object/sign/freelancer-cvs/cv?token=test-token",
        expiresInSeconds: 60,
      });
      expect(mocks.fromCalls).toEqual(["projects", "shortlists", "matches"]);
      expect(mocks.eqCalls).toEqual([
        ["projects", "id", PROJECT_ID],
        ["projects", "owner_user_id", USER_ID],
        ["shortlists", "project_id", PROJECT_ID],
        ["shortlists", "owner_user_id", USER_ID],
        ["matches", "shortlist_id", SHORTLIST_ID],
        ["matches", "owner_user_id", USER_ID],
        ["matches", "freelancer_profile_id", PROFILE_ID],
      ]);
      expect(mocks.orderCalls).toEqual([
        ["shortlists", "created_at", { ascending: false }],
        ["shortlists", "id", { ascending: false }],
      ]);
      expect(mocks.limitCalls).toEqual([["shortlists", 1]]);
      expect(mocks.storageFromCalls).toEqual(["freelancer-cvs"]);
      expect(mocks.info).toHaveBeenCalledWith(`${PROFILE_ID}/cv-v1.pdf`);
      expect(mocks.createSignedUrl).toHaveBeenCalledWith(
        `${PROFILE_ID}/cv-v1.pdf`,
        60,
        { download: "freelancer-cv.pdf" },
      );
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "freelancer_cv_download_authorized",
          actorUserId: USER_ID,
          targetId: PROFILE_ID,
          outcome: "success",
          metadata: {
            matchId: MATCH_ID,
            projectId: PROJECT_ID,
            documentVersion: 1,
          },
          required: true,
        }),
      );
      expect(response.headers.get("cache-control")).toContain("no-store");
    },
  );

  it("returns a generic 404 when the owned project does not exist", async () => {
    mocks.project = null;

    const response = await POST(request(), context());

    await expectGenericUnavailable(response);
    expect(mocks.fromCalls).toEqual(["projects"]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("denies a pending project even when an older ranked shortlist exists", async () => {
    mocks.project = { id: PROJECT_ID, brief_status: "pending" };

    const response = await POST(request(), context());

    await expectGenericUnavailable(response);
    expect(mocks.fromCalls).toEqual(["projects"]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("denies a failed project instead of authorizing an older shortlist", async () => {
    mocks.project = { id: PROJECT_ID, brief_status: "failed" };

    const response = await POST(request(), context());

    await expectGenericUnavailable(response);
    expect(mocks.fromCalls).toEqual(["projects"]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it.each([null, "needs_clarification", "no_reliable_match"])(
    "denies a missing or non-ranked latest shortlist (%s) without falling back to history",
    async (resultStatus) => {
      mocks.shortlist = resultStatus === null
        ? null
        : { id: SHORTLIST_ID, result_status: resultStatus };

      const response = await POST(request(), context());

      await expectGenericUnavailable(response);
      expect(mocks.fromCalls).not.toContain("matches");
      expect(mocks.fetchDocument).not.toHaveBeenCalled();
    },
  );

  it("returns a generic 404 when the exact profile has no match in the latest shortlist", async () => {
    mocks.match = null;

    const response = await POST(request(), context());

    await expectGenericUnavailable(response);
    expect(mocks.eqCalls).toContainEqual([
      "matches",
      "shortlist_id",
      SHORTLIST_ID,
    ]);
    expect(mocks.eqCalls).toContainEqual([
      "matches",
      "freelancer_profile_id",
      PROFILE_ID,
    ]);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
  });

  it("authorizes a partial match, which is a decided role", async () => {
    mocks.match = {
      id: MATCH_ID,
      evaluation_snapshot: evaluationSnapshot("partial"),
    };

    const response = await POST(request(), context());

    // The card labels it as not recommended; the download is still the
    // reader's to make. Only an absent or unrecognised role fails closed.
    expect(response.status).toBe(200);
    expect(mocks.fetchDocument).toHaveBeenCalled();
  });

  it("denies an invalid evaluation snapshot with the same generic 404", async () => {
    mocks.match = {
      id: MATCH_ID,
      evaluation_snapshot: {
        schemaVersion: 1,
        recommendationRole: "primary",
      },
    };

    const response = await POST(request(), context());

    await expectGenericUnavailable(response);
    expect(mocks.fetchDocument).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("uses the same generic 404 when an authorized profile has no downloadable CV", async () => {
    mocks.fetchDocument.mockResolvedValue(null);

    const response = await POST(request(), context());

    await expectGenericUnavailable(response);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it("fails closed before signing when live Storage metadata has a cache TTL above 60 seconds", async () => {
    mocks.info.mockResolvedValue({
      data: {
        bucketId: "freelancer-cvs",
        contentType: "application/pdf",
        size: 1_000,
        cacheControl: "max-age=3600",
      },
      error: null,
    });

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Der CV-Download ist gerade nicht verfügbar." });
    expect(mocks.info).toHaveBeenCalledWith(`${PROFILE_ID}/cv-v1.pdf`);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("cache");
  });

  it("rejects a signed URL outside the configured Supabase Storage origin", async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl:
          "https://attacker.example/storage/v1/object/sign/freelancer-cvs/cv?token=test-token",
      },
      error: null,
    });

    const response = await POST(request(), context());

    expect(response.status).toBe(503);
    expect(mocks.audit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "freelancer_cv_download_authorized" }),
    );
  });

  it("fails closed without disclosing the signed URL when the required audit is unavailable", async () => {
    mocks.audit.mockImplementation(async (input: { required?: boolean }) => {
      if (input.required) throw new Error("audit unavailable");
      return "trace-id";
    });

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Der CV-Download ist gerade nicht verfügbar." });
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain("signedUrl");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ required: true }),
    );
  });
});
