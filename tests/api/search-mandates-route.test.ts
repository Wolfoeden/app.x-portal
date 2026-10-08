import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/placement/mandates", () => ({ openMandateForProject: async () => ({ id: "historical", status: "open", commercialModel: "legacy_placement" }) }));
import { GET, POST } from "@/app/api/search-mandates/route";
describe("historical manual search mandates", () => {
  it("keeps existing mandates readable", async () => {
    const response = await GET(new Request("https://x-portal.eu/api/search-mandates?projectId=22222222-2222-4222-8222-222222222222"));
    expect((await response.json()).mandate.id).toBe("historical");
  });
  it("routes new work to saved project criteria without accepting a fee-bearing mandate", async () => {
    const response = await POST();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ nextAction: "edit_criteria", href: "/chat" });
  });
});
