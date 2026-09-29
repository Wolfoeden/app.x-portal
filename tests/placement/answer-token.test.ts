import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  answerTokensConfigured,
  answerUrl,
  mintAnswerToken,
  readAnswerToken,
} from "@/lib/placement/answer-token";
import { mintUnsubscribeToken } from "@/lib/email/unsubscribe";

const REQUEST = "66666666-6666-4666-8666-666666666666";

beforeEach(() => {
  vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "a-long-enough-secret-for-the-tests-0123456789");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("answer links in follow-up emails", () => {
  it("tells who answers about which introduction", () => {
    const client = mintAnswerToken(REQUEST, "client")!;
    const freelancer = mintAnswerToken(REQUEST, "freelancer")!;

    expect(readAnswerToken(client)).toEqual({ requestId: REQUEST, role: "client" });
    expect(readAnswerToken(freelancer)).toEqual({ requestId: REQUEST, role: "freelancer" });
  });

  it("rejects a changed token", () => {
    const token = mintAnswerToken(REQUEST, "freelancer")!;
    const [payload, signature] = token.split(".");
    const asClient = `${Buffer.from(`${REQUEST}:c`).toString("base64url")}.${signature}`;

    expect(readAnswerToken(asClient)).toBeNull();
    expect(readAnswerToken(`${payload}.${signature}x`)).toBeNull();
    expect(readAnswerToken("kein-token")).toBeNull();
  });

  // Derselbe Schlüssel signiert die Abmeldelinks. Ein Abmeldetoken darf nicht
  // als Antwort durchgehen.
  it("does not accept an unsubscribe token", () => {
    const unsubscribe = mintUnsubscribeToken("kunde@firma.example")!;

    expect(readAnswerToken(unsubscribe)).toBeNull();
  });

  it("issues nothing without a secret", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");

    expect(answerTokensConfigured()).toBe(false);
    expect(mintAnswerToken(REQUEST, "client")).toBeNull();
  });

  it("puts the preselected answer next to the token", () => {
    const url = new URL(answerUrl("https://x-portal.eu", "abc.def", "engaged"));

    expect(url.pathname).toBe("/vermittlung/antwort");
    expect(url.searchParams.get("t")).toBe("abc.def");
    expect(url.searchParams.get("a")).toBe("engaged");
  });
});
