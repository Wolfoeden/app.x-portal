import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(
    async (_input: unknown): Promise<{
      error: { message: string } | null;
    }> => {
      void _input;
      return { error: null };
    },
  ),
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
    mocks.insert.mockReset();
    mocks.insert.mockResolvedValue({ error: null });
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

  it("fails closed for a required audit when persistence fails", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
    mocks.insert.mockResolvedValue({ error: { message: "database down" } });

    await expect(
      writeAuditEvent({
        actorUserId: "00000000-0000-4000-8000-000000000002",
        action: "ai_usage_admin_viewed",
        targetType: "ai_usage",
        outcome: "success",
        required: true,
      }),
    ).rejects.toThrow("required_audit_write_failed");
  });

  it("fails closed for a required audit when the service is not configured", async () => {
    await expect(
      writeAuditEvent({
        actorUserId: "00000000-0000-4000-8000-000000000003",
        action: "ai_usage_admin_viewed",
        targetType: "ai_usage",
        outcome: "success",
        required: true,
      }),
    ).rejects.toThrow("required_audit_not_configured");
  });
});
