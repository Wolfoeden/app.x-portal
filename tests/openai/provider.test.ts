import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  OPENAI_OFFICIAL_BASE_URL,
  resolveOpenAiConnection,
} from "@/lib/openai/provider";

describe("resolveOpenAiConnection", () => {
  it("reports an absent key without exposing environment values", () => {
    expect(resolveOpenAiConnection({})).toEqual({
      configured: false,
      transport: "unconfigured",
      baseUrl: null,
    });
  });

  it("uses the official API when a customer key has no base URL override", () => {
    expect(resolveOpenAiConnection({ OPENAI_API_KEY: "secret-test-value" })).toEqual({
      configured: true,
      transport: "direct_openai",
      baseUrl: OPENAI_OFFICIAL_BASE_URL,
    });
  });

  it("ignores a platform gateway override and stays on the official API", () => {
    expect(
      resolveOpenAiConnection({
        OPENAI_API_KEY: "gateway-test-value",
        OPENAI_BASE_URL: "https://ai-gateway.netlify.example/v1/",
      }),
    ).toEqual({
      configured: true,
      transport: "direct_openai",
      baseUrl: OPENAI_OFFICIAL_BASE_URL,
    });
  });
});
