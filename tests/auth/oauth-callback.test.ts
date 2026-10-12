import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  getClaims: vi.fn(),
  cookie: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/auth/guest-claim", () => ({ consumeGuestClaim: vi.fn(), GUEST_CLAIM_COOKIE: "guest-claim" }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { exchangeCodeForSession: mocks.exchange, getClaims: mocks.getClaims },
  }),
}));

import { GET } from "@/app/auth/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://x-portal.eu");
  mocks.cookie.mockReturnValue(undefined);
});

// Oktober 2026: Eine gescheiterte Verbindung kam ohne Code zurück und wurde
// als „missing_code“ verschluckt. Der Grund gehört auf die Seite.
describe("GET /auth/callback after connecting a provider", () => {
  it("says that the GitHub account already belongs to another XPORTAL account", async () => {
    const response = await GET(new Request(
      "https://x-portal.eu/auth/callback?next=%2Fbewerber-portal%2Fapply&error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user",
    ));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/bewerber-portal/apply");
    expect(location.searchParams.get("auth_error")).toBe("identity_already_exists");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("reports any other provider error as a failed connection", async () => {
    const response = await GET(new Request("https://x-portal.eu/auth/callback?next=%2Fbewerber-portal%2Fapply&error=access_denied&error_code=access_denied"));
    expect(new URL(response.headers.get("location")!).searchParams.get("auth_error")).toBe("link_failed");
  });
});
