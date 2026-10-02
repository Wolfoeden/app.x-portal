import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  view: vi.fn(),
  audit: vi.fn(),
  allowed: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void task(),
}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/freelancer/public-profile", () => ({ loadPublicProfileView: mocks.view }));
vi.mock("@/lib/security/shared-rate-limit", () => ({
  consumeRateLimit: async () => ({ allowed: mocks.allowed, retryAfterSeconds: 30 }),
}));

import { GET } from "@/app/api/freelancers/[id]/route";

const ID = "11111111-1111-4111-8111-111111111111";
const call = (id: string, query = "") =>
  GET(new Request(`https://x-portal.eu/api/freelancers/${id}${query}`, { headers: { "x-forwarded-for": "203.0.113.9" } }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.audit.mockResolvedValue("trace");
  mocks.view.mockResolvedValue({ profile: { id: ID }, dossier: { id: ID, displayName: "Kim" } });
});

describe("GET /api/freelancers/[id]", () => {
  it("returns the dossier and records where the panel was opened", async () => {
    const response = await call(ID, "?via=shortcut");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dossier: { id: ID, displayName: "Kim" } });
    expect(response.headers.get("cache-control")).toBe("private, max-age=60");
    await vi.waitFor(() =>
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "profile_panel_opened", targetId: ID, metadata: { via: "shortcut", account: "none" } }),
      ),
    );
  });

  it("answers 404 for an unknown or inactive profile and for a malformed id", async () => {
    mocks.view.mockResolvedValueOnce(null);
    expect((await call(ID)).status).toBe(404);
    expect((await call("vorschau")).status).toBe(404);
    expect(mocks.view).toHaveBeenCalledTimes(1);
  });

  it("ignores an unknown source and limits heavy callers", async () => {
    await call(ID, "?via=spam");
    await vi.waitFor(() => expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { via: null, account: "none" } })));
    mocks.allowed = false;
    expect((await call(ID)).status).toBe(429);
  });
});
