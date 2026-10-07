import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { contactRecipientHash, mintContactToken, readContactToken } from "@/lib/placement/contact-token";
const ID = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.unstubAllEnvs());
describe("contact consent capability", () => {
  it("requires configured secret, expires after seven days, and binds the recipient", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    expect(mintContactToken(ID)).toBeNull();
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-only-long-secret-01234567890123456789");
    const now = Date.now();
    const token = mintContactToken(ID, now, "Person@example.invalid")!;
    expect(readContactToken(token, now)).toEqual({ requestId: ID, recipientHash: contactRecipientHash("person@example.invalid") });
    expect(readContactToken(`${token}x`, now)).toBeNull();
    expect(readContactToken(token, now + 7 * 24 * 60 * 60_000)).toBeNull();
    expect(readContactToken(token, now)?.recipientHash).not.toBe(contactRecipientHash("changed@example.invalid"));
  });
});
