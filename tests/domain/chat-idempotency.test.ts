import { describe, expect, it } from "vitest";

import {
  createChatRequestKey,
  interactionIdForChatRequest,
  projectIdForChatRequest,
} from "../../lib/domain/chat-idempotency";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

describe("chat request idempotency", () => {
  it("derives stable request, interaction and project identifiers", () => {
    const first = createChatRequestKey("user-1", "message-12345678");
    const replay = createChatRequestKey("user-1", "message-12345678");

    expect(replay).toBe(first);
    expect(interactionIdForChatRequest(first)).toMatch(UUID_PATTERN);
    expect(projectIdForChatRequest(first)).toMatch(UUID_PATTERN);
    expect(projectIdForChatRequest(replay)).toBe(projectIdForChatRequest(first));
  });

  it("separates different users and client messages", () => {
    const baseline = createChatRequestKey("user-1", "message-12345678");

    expect(createChatRequestKey("user-2", "message-12345678")).not.toBe(
      baseline,
    );
    expect(createChatRequestKey("user-1", "message-87654321")).not.toBe(
      baseline,
    );
    expect(
      createChatRequestKey(
        "user-1",
        "message-12345678",
        "00000000-0000-0000-0000-000000000001",
      ),
    ).not.toBe(baseline);
  });
});
