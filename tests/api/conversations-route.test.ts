import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; isAnonymous: boolean; isAdmin: boolean },
  role: vi.fn(),
  answer: vi.fn(),
  list: vi.fn(),
  byToken: vi.fn(),
  audit: vi.fn(),
  followUps: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => mocks.user,
  requireAdminUser: async () => {
    if (!mocks.user?.isAdmin) throw new Response(null, { status: 403 });
    return mocks.user;
  },
}));
vi.mock("@/lib/placement/conversations", () => ({
  answerConversation: mocks.answer,
  conversationForToken: mocks.byToken,
  conversationRole: mocks.role,
  listConversations: mocks.list,
}));
vi.mock("@/lib/placement/engagements", () => ({ sendDueFollowUps: mocks.followUps }));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/security/shared-rate-limit", () => ({
  consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
}));

import { POST as runFollowUps } from "@/app/api/admin/introductions/follow-ups/route";
import { GET, POST } from "@/app/api/conversations/route";
import { mintAnswerToken } from "@/lib/placement/answer-token";

const REQUEST = "66666666-6666-4666-8666-666666666666";
const SECRET = "a-scheduler-secret-that-is-long-enough-0123456789";

function answer(body: unknown) {
  return POST(
    new Request("https://x-portal.eu/api/conversations", {
      method: "POST",
      headers: {
        origin: "https://x-portal.eu",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = null;
  vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  vi.stubEnv("IP_HASH_SECRET", "a-secure-test-secret-that-is-long-enough");
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a-long-enough-secret-for-the-tests-0123456789");
  vi.stubEnv("PLACEMENT_RUN_SECRET", SECRET);
  mocks.audit.mockResolvedValue("trace");
  mocks.answer.mockResolvedValue({ recorded: true, requestId: REQUEST, clientUserId: "client-1", role: "client" });
  mocks.list.mockResolvedValue([]);
  mocks.byToken.mockResolvedValue(null);
  mocks.followUps.mockResolvedValue({ sent: 2, failed: 0 });
});

afterEach(() => vi.unstubAllEnvs());

describe("answering in Gespräche", () => {
  it("answers for the side the signed-in user is on", async () => {
    mocks.user = { id: "client-1", isAnonymous: false, isAdmin: false };
    mocks.role.mockResolvedValue("client");

    const response = await answer({ requestId: REQUEST, answer: "engaged" });

    expect(response.status).toBe(200);
    expect(mocks.role).toHaveBeenCalledWith("client-1", REQUEST);
    expect(mocks.answer).toHaveBeenCalledWith(REQUEST, "client", "engaged", "https://x-portal.eu");
  });

  it("refuses a conversation that belongs to someone else", async () => {
    mocks.user = { id: "stranger", isAnonymous: false, isAdmin: false };
    mocks.role.mockResolvedValue(null);

    const response = await answer({ requestId: REQUEST, answer: "no_engagement" });

    expect(response.status).toBe(404);
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("answers without a login through the link from the mail, for the side in the token", async () => {
    const token = mintAnswerToken(REQUEST, "freelancer")!;

    const response = await answer({ requestId: REQUEST, answer: "engaged", token });

    expect(response.status).toBe(200);
    expect(mocks.answer).toHaveBeenCalledWith(REQUEST, "freelancer", "engaged", "https://x-portal.eu");
  });

  it("does not let a token for one request answer another", async () => {
    const token = mintAnswerToken("77777777-7777-4777-8777-777777777777", "client")!;

    const response = await answer({ requestId: REQUEST, answer: "engaged", token });

    expect(response.status).toBe(404);
  });

  it("shows the conversation behind a link and flags an invalid one", async () => {
    const response = await GET(new Request("https://x-portal.eu/api/conversations?t=kaputt"));
    const body = (await response.json()) as { conversations: unknown[]; linkInvalid: boolean };
    expect(body).toMatchObject({ conversations: [], linkInvalid: true });
  });
});

describe("the daily follow-up run", () => {
  function run(headers: Record<string, string>) {
    return runFollowUps(new Request("https://x-portal.eu/api/admin/introductions/follow-ups", { method: "POST", headers }));
  }

  it("runs for the scheduler with the right token", async () => {
    const response = await run({ "x-placement-run-token": SECRET });
    expect(response.status).toBe(200);
    expect(mocks.followUps).toHaveBeenCalledTimes(1);
    expect(mocks.audit.mock.calls[0][0].metadata).toMatchObject({ via: "scheduler", sent: 2 });
  });

  it("rejects a wrong token", async () => {
    const response = await run({ "x-placement-run-token": `${SECRET}x` });
    expect(response.status).toBe(401);
    expect(mocks.followUps).not.toHaveBeenCalled();
  });

  it("still needs an admin without a token", async () => {
    mocks.user = { id: "client-1", isAnonymous: false, isAdmin: false };
    const response = await run({ origin: "https://x-portal.eu", "sec-fetch-site": "same-origin" });
    expect(response.status).toBe(403);
    expect(mocks.followUps).not.toHaveBeenCalled();
  });
});
