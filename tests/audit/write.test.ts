import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(async () => ({ error: null })),
  logEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ insert: mocks.insert }),
  }),
}));
vi.mock("@/lib/security/request", () => ({ logEvent: mocks.logEvent }));

import { writeAuditEvent } from "@/lib/audit/write";

describe("audit writer", () => {
  afterEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    mocks.insert.mockClear();
    mocks.logEvent.mockClear();
  });

  it("persists actorless failures with a non-identifying system tombstone", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";

    await writeAuditEvent({
      actorUserId: null,
      action: "project_chat_failed",
      targetType: "project",
      outcome: "failed",
      traceId: "00000000-0000-4000-8000-000000000001",
    });

    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: null,
        actor_tombstone: expect.stringMatching(/^system:[0-9a-f-]{36}$/u),
        action: "project_chat_failed",
        outcome: "failed",
      }),
    );
  });
});
