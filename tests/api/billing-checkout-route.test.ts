import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

import { GET } from "@/app/api/billing/checkout/route";

const accountId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue({
    id: accountId,
    isAnonymous: false,
  });
});

describe("canonical pricing checkout route", () => {
  it("sends a permanent account directly to the selected Stripe checkout", async () => {
    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=pro"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(303);
    expect(`${location.origin}${location.pathname}`).toBe(
      "https://buy.stripe.com/3cIcN4fVnb9DcyS9haa3u05",
    );
    expect(location.searchParams.get("client_reference_id")).toBe(accountId);
  });

  it("sends guests through login while retaining the chosen plan", async () => {
    mocks.requireCurrentUser.mockResolvedValue({
      id: accountId,
      isAnonymous: true,
    });

    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=basic"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/chat?checkout=basic",
    );
  });

  it("sends signed-out visitors through login while retaining the chosen plan", async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new Response("Authentication required", { status: 401 }),
    );

    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=business"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/chat?checkout=business",
    );
  });

  it("keeps production redirects on x-portal.eu behind Netlify's internal host", async () => {
    mocks.requireCurrentUser.mockRejectedValue(
      new Response("Authentication required", { status: 401 }),
    );

    const response = await GET(
      new Request(
        "https://main--app-x-portal-chat.netlify.app/api/billing/checkout?plan=pro",
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/chat?checkout=pro",
    );
  });
  it("rejects unknown plan names before checking authentication", async () => {
    const response = await GET(
      new Request("https://x-portal.eu/api/billing/checkout?plan=enterprise"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://x-portal.eu/preise?billing=invalid-plan",
    );
    expect(mocks.requireCurrentUser).not.toHaveBeenCalled();
  });
});
