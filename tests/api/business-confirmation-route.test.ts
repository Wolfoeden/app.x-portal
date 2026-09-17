import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: mocks.requireUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ update: mocks.update }),
  }),
}));

import { POST } from "@/app/api/billing/business-confirmation/route";
import { TERMS_VERSION } from "@/lib/legal/policy";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function request(origin = "https://x-portal.eu") {
  return new Request("https://x-portal.eu/api/billing/business-confirmation", {
    method: "POST",
    headers: { origin },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  mocks.requireUser.mockResolvedValue({
    id: USER_ID,
    email: "kunde@example.invalid",
    isAnonymous: false,
    isAdmin: false,
  });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { user_id: USER_ID }, error: null });
});

describe("POST /api/billing/business-confirmation", () => {
  it("speichert Zeitpunkt und AGB-Fassung auf dem bestehenden Abrechnungskonto", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      business_terms_version: TERMS_VERSION,
      business_confirmed_at: expect.any(String),
    }));
    expect(mocks.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(await response.json()).toEqual({
      confirmed: true,
      termsVersion: TERMS_VERSION,
    });
  });

  it("lehnt Gastkonten und fremde Ursprünge ab", async () => {
    mocks.requireUser.mockResolvedValue({
      id: USER_ID,
      email: null,
      isAnonymous: true,
      isAdmin: false,
    });
    expect((await POST(request())).status).toBe(403);
    expect((await POST(request("https://angreifer.invalid"))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("bricht ab, wenn das bestehende Credit-Konto noch nicht bereit ist", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    expect((await POST(request())).status).toBe(409);
  });
});
