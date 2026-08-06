import "server-only";

import { randomUUID } from "node:crypto";

import { logEvent } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const prohibitedKeys = /(?:body|content|message|token|secret|password|card|email|phone)/iu;

function redactedMetadata(
  metadata: Record<string, string | number | boolean | null>,
) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !prohibitedKeys.test(key))
      .slice(0, 20),
  );
}

export async function writeAuditEvent(input: {
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: "success" | "denied" | "failed";
  traceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<string> {
  const traceId = input.traceId ?? randomUUID();
  const metadata = redactedMetadata(input.metadata ?? {});

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    logEvent("audit_fallback", {
      traceId,
      action: input.action,
      targetType: input.targetType,
      outcome: input.outcome,
    });
    return traceId;
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("audit_events").insert({
    actor_user_id: input.actorUserId,
    actor_tombstone: input.actorUserId ? null : `system:${randomUUID()}`,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    outcome: input.outcome,
    trace_id: traceId,
    metadata,
  });

  if (error) {
    logEvent("audit_write_failed", { traceId, action: input.action });
  }
  return traceId;
}
