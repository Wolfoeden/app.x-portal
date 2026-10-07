import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), record: vi.fn(), limit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/analytics/recruiting-server", () => ({ recordRecruitingEvent: mocks.record }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.limit }));
import { POST } from "@/app/api/recruiting-events/route";
const payload = {event:"demo_viewed",entityId:"test-demo",sessionId:"11111111-1111-4111-8111-111111111111",source:"reddit",outcome:"success"};
function request(body: unknown = payload, consent = "v3.all") {
  return new Request("https://x-portal.eu/api/recruiting-events", {method:"POST", headers:{origin:"https://x-portal.eu","content-type":"application/json",cookie:`xportal_cookie_consent=${consent}`},body:JSON.stringify(body)});
}
beforeEach(() => {vi.clearAllMocks();process.env.IP_HASH_SECRET="long-and-secure-test-secret-for-event-hashing";mocks.user.mockResolvedValue(null);mocks.limit.mockResolvedValue({allowed:true});});
describe("optional recruiting measurement", () => {
  it("does not record without current explicit consent", async () => {
    for (const consent of ["", "v3.essential", "v2.all"]) expect((await POST(request(payload,consent))).status).toBe(204);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("records consented public demo without fabricating paid activation", async () => {
    expect((await POST(request())).status).toBe(204);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({event:"demo_viewed",origin:"client",source:"reddit"}));
    expect((await POST(request({...payload,event:"trial_activated"}))).status).toBe(400);
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
  it("rejects sensitive and arbitrary payloads", async () => {
    for (const body of [{...payload,projectText:"private"},{...payload,email:"person@example.com"},{...payload,outcome:"free text"},{...payload,source:"email@example.com"}]) expect((await POST(request(body))).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("requires an account for registration or recurring use", async () => {
    expect((await POST(request({...payload,event:"return_use"}))).status).toBe(401);
    mocks.user.mockResolvedValue({id:"user-1",isAdmin:true});
    expect((await POST(request({...payload,event:"return_use"}))).status).toBe(204);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({userId:"user-1",isInternal:true}));
  });
});
