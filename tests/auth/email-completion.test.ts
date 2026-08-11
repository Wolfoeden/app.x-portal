import { describe, expect, it } from "vitest";

import {
  emailAuthFailurePath,
  parseEmailAuthCompletion,
} from "@/lib/auth/email-completion";

describe("email authentication completion", () => {
  it("reads default Supabase fragment tokens and removes them from the sanitized URL", () => {
    const completion = parseEmailAuthCompletion(
      "https://x-portal.eu/auth/complete?next=%2Fchat%3Fset-password%3D1&state=bound-state#access_token=secret-access&refresh_token=secret-refresh&type=recovery",
    );

    expect(completion).toMatchObject({
      accessToken: "secret-access",
      code: null,
      destination: "/chat?set-password=1",
      hasProviderError: false,
      refreshToken: "secret-refresh",
      sanitizedPath: "/auth/complete?next=%2Fchat%3Fset-password%3D1",
      state: "bound-state",
    });
    expect(completion.sanitizedPath).not.toContain("secret");
  });

  it("supports PKCE codes and rejects unsafe destinations", () => {
    const completion = parseEmailAuthCompletion(
      "https://x-portal.eu/auth/complete?code=secret-code&next=%2F%5Cevil.example",
    );

    expect(completion.code).toBe("secret-code");
    expect(completion.destination).toBe("/chat");
    expect(completion.sanitizedPath).not.toContain("secret-code");
  });

  it("recognizes expired provider links without exposing the provider message", () => {
    const completion = parseEmailAuthCompletion(
      "https://x-portal.eu/auth/complete?next=%2Fchat%3Fset-password%3D1#error_code=otp_expired&error_description=expired",
    );

    expect(completion.hasProviderError).toBe(true);
    expect(completion.sanitizedPath).not.toContain("expired");
  });

  it("never opens the password dialog after a failed confirmation", () => {
    expect(emailAuthFailurePath("/chat?set-password=1&project=123")).toBe(
      "/chat?project=123&auth_error=confirmation_failed",
    );
  });
});
