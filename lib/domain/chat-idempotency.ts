import { createHash } from "node:crypto";

function uuidFromHex(value: string): string {
  const hex = value.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createChatRequestKey(
  userId: string,
  clientMessageId: string,
  existingProjectId?: string | null,
): string {
  return createHash("sha256")
    .update(
      `chat:${userId}:${existingProjectId?.trim() || "new"}:${clientMessageId}`,
    )
    .digest("hex");
}

export function projectIdForChatRequest(requestKey: string): string {
  return uuidFromHex(
    createHash("sha256").update(`project:${requestKey}`).digest("hex"),
  );
}

export function interactionIdForChatRequest(requestKey: string): string {
  return uuidFromHex(requestKey);
}
