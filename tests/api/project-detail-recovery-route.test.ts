import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  fetchActiveProfiles: vi.fn(),
  fetchProfilesByIds: vi.fn(),
  from: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: mocks.requireUser,
}));
vi.mock("@/lib/data/freelancers", () => ({
  fetchActiveBookableRealProfiles: mocks.fetchActiveProfiles,
  fetchRealProfilesByIds: mocks.fetchProfilesByIds,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({ from: mocks.from }),
}));

import { GET } from "@/app/api/projects/[id]/route";
import { applyBriefPatch, buildShortlist, parseFallbackBrief } from "@/lib/domain";
import { profileFixtures } from "../domain/fixtures";

const userId = "10000000-0000-4000-8000-000000000001";
const projectId = "20000000-0000-4000-8000-000000000001";
const fixedNow = new Date("2026-08-13T12:00:00.000Z");

function configureProjectQueries(
  shortlist: Record<string, unknown> | null = null,
  projectOverrides: Record<string, unknown> = {},
) {
  const project = {
    id: projectId,
    owner_user_id: userId,
    title: "React-Unterstützung",
    original_request: "React freelancer in German, remote",
    structured_brief: parseFallbackBrief(
      "React freelancer in German, remote",
      { now: fixedNow },
    ),
    brief_status: "pending",
    status: "matching",
    created_at: fixedNow.toISOString(),
    updated_at: fixedNow.toISOString(),
    collection_id: null,
    ...projectOverrides,
  };

  mocks.from.mockImplementation((table: string) => {
    if (table === "freelancer_cv_documents") {
      const cvQuery: Record<string, (...args: unknown[]) => unknown> = {};
      cvQuery.select = () => cvQuery;
      cvQuery.in = () => cvQuery;
      cvQuery.eq = () =>
        Promise.resolve({
          data: [{ profile_id: profileFixtures[0]!.id }],
          error: null,
        });
      return cvQuery;
    }
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    query.select = () => query;
    query.eq = () => query;
    query.order = () =>
      table === "matches"
        ? Promise.resolve({ data: [], error: null })
        : query;
    query.limit = () =>
      table === "messages"
        ? Promise.resolve({ data: [], error: null })
        : query;
    query.maybeSingle = () => {
      if (table === "projects") {
        return Promise.resolve({ data: project, error: null });
      }
      if (table === "shortlists") {
        return Promise.resolve({ data: shortlist, error: null });
      }
      throw new Error(`Unexpected maybeSingle for ${table}`);
    };
    return query;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  mocks.requireUser.mockResolvedValue({ id: userId, isAnonymous: false });
  mocks.audit.mockResolvedValue("audit-id");
  mocks.fetchActiveProfiles.mockResolvedValue(profileFixtures);
  mocks.fetchProfilesByIds.mockResolvedValue([]);
  configureProjectQueries();
});

afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("project detail deterministic recovery", () => {
  it("returns at most three current deterministic profiles when a matching project has no shortlist", async () => {
    const response = await GET(new Request(`https://x-portal.eu/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profiles.map((profile: { displayName: string }) => profile.displayName)).toEqual([
      "Anna Keller",
      "Clara Vogt",
      "Boris Neumann",
    ]);
    expect(body.profiles).toHaveLength(3);
    expect(body.analysisMode).toBe("fallback");
    expect(body.analysisNotice).toContain("deterministisch");
    expect(mocks.fetchActiveProfiles).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProfilesByIds).not.toHaveBeenCalled();
    expect(
      body.profiles.every(
        (profile: { cvAccess: string }) => profile.cvAccess === "forbidden",
      ),
    ).toBe(true);
    expect(mocks.from).not.toHaveBeenCalledWith("freelancer_cv_documents");
  });

  it("keeps pending recovery CV existence opaque to guests without a metadata query", async () => {
    mocks.requireUser.mockResolvedValue({ id: userId, isAnonymous: true });

    const response = await GET(new Request(`https://x-portal.eu/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profiles).toHaveLength(3);
    expect(
      body.profiles.every(
        (profile: { cvAccess: string }) => profile.cvAccess === "login_required",
      ),
    ).toBe(true);
    expect(mocks.from).not.toHaveBeenCalledWith("freelancer_cv_documents");
  });

  it("returns an honest empty profile list when no current profile is eligible", async () => {
    mocks.fetchActiveProfiles.mockResolvedValue([]);

    const response = await GET(new Request(`https://x-portal.eu/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profiles).toEqual([]);
    expect(body.analysisMode).toBe("fallback");
  });

  it("does not combine a pending follow-up brief with an older shortlist", async () => {
    configureProjectQueries({
      id: "30000000-0000-4000-8000-000000000001",
      result_status: "ranked",
    });

    const response = await GET(new Request(`https://x-portal.eu/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profiles).toHaveLength(3);
    expect(body.analysisNotice).toContain("ältere Shortlist");
    expect(mocks.fetchActiveProfiles).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProfilesByIds).not.toHaveBeenCalled();
    expect(
      body.profiles.every(
        (profile: { cvAccess: string }) => profile.cvAccess === "forbidden",
      ),
    ).toBe(true);
    expect(mocks.from).not.toHaveBeenCalledWith("freelancer_cv_documents");
  });

  it("keeps a completed zero-result shortlist when status remains matching", async () => {
    configureProjectQueries(
      { id: "30000000-0000-4000-8000-000000000001" },
      { brief_status: "ready", status: "matching" },
    );

    const response = await GET(new Request(`https://x-portal.eu/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profiles).toEqual([]);
    expect(body.analysisMode).toBe("ai");
    expect(mocks.fetchActiveProfiles).not.toHaveBeenCalled();
    expect(mocks.fetchProfilesByIds).toHaveBeenCalledWith(expect.anything(), []);
  });

  it("restores persisted partial matches separately and without booking access", async () => {
    const partialBrief = applyBriefPatch(
      parseFallbackBrief(
        "Muss-Anforderungen:\n- React\n- C++\n100% remote",
        { now: fixedNow },
      ),
      { requiredSkills: ["React", "C++"], workMode: "remote" },
    );
    const partialShortlist = buildShortlist(partialBrief, [profileFixtures[0]!]);
    configureProjectQueries(
      {
        id: "30000000-0000-4000-8000-000000000002",
        result_count: 0,
        result_status: "no_reliable_match",
        decision_snapshot: partialShortlist.decisionSnapshot,
        partial_matches_snapshot: partialShortlist.partialMatches.map((match) => ({
          ...match,
          profile: {
            ...match.profile,
            introPolicy: { ...match.profile.introPolicy, bookingUrl: null },
          },
        })),
        matching_rule_version: "freelancer-match-v13",
      },
      {
        structured_brief: partialBrief,
        brief_status: "ready",
        status: "matching",
      },
    );

    const response = await GET(new Request(`https://x-portal.eu/api/projects/${projectId}`), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.matchingStatus).toBe("no_reliable_match");
    expect(body.profiles).toEqual([]);
    expect(body.partialProfiles).toHaveLength(1);
    expect(body.partialProfiles[0]).toMatchObject({
      displayName: "Anna Keller",
      recommendationRole: "partial",
      bookingUrl: null,
    });
  });
});
