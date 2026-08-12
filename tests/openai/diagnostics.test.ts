import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

import { diagnoseOpenAiProvider } from "@/lib/openai/diagnostics";

const MODEL = "gpt-5.6-luna";
const SECRET = "sk-test-must-never-appear";

function configuredEnvironment(model = MODEL) {
  return { OPENAI_API_KEY: SECRET, OPENAI_MODEL: model };
}

function clientRejecting(error: unknown) {
  const retrieve = vi.fn().mockRejectedValue(error);
  const clientFactory = vi.fn(() => ({ models: { retrieve } }));
  return { retrieve, clientFactory };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("diagnoseOpenAiProvider", () => {
  it("returns an unconfigured result without making a provider request", async () => {
    const clientFactory = vi.fn();

    const result = await diagnoseOpenAiProvider({
      environment: { OPENAI_MODEL: MODEL },
      clientFactory,
    });

    expect(result).toEqual({
      configured: false,
      transport: "unconfigured",
      requestedModel: MODEL,
      status: "unconfigured",
    });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("retrieves only model metadata and reports a reachable provider", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: MODEL,
      object: "model",
      created: 1,
      owned_by: "openai",
    });
    const clientFactory = vi.fn(() => ({ models: { retrieve } }));

    const result = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(),
      clientFactory,
      timeoutMs: 1_500,
    });

    expect(clientFactory).toHaveBeenCalledWith(SECRET);
    expect(retrieve).toHaveBeenCalledWith(MODEL, {
      timeout: 1_500,
      maxRetries: 0,
    });
    expect(result).toEqual({
      configured: true,
      transport: "direct_openai",
      requestedModel: MODEL,
      status: "reachable",
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it.each([
    {
      label: "authentication",
      error: new AuthenticationError(
        401,
        { code: "invalid_api_key", message: "sensitive auth body" },
        "sensitive auth message",
        new Headers({ "x-request-id": "req_auth" }),
      ),
      status: "auth_error",
      httpStatus: 401,
      requestId: "req_auth",
    },
    {
      label: "quota",
      error: new RateLimitError(
        429,
        { code: "insufficient_quota", message: "sensitive quota body" },
        "sensitive quota message",
        new Headers({ "x-request-id": "req_quota" }),
      ),
      status: "billing_or_quota",
      httpStatus: 429,
      requestId: "req_quota",
    },
    {
      label: "permission",
      error: new PermissionDeniedError(
        403,
        { code: "forbidden", message: "sensitive permission body" },
        "sensitive permission message",
        new Headers({ "x-request-id": "req_permission" }),
      ),
      status: "permission",
      httpStatus: 403,
      requestId: "req_permission",
    },
    {
      label: "missing model",
      error: new NotFoundError(
        404,
        { code: "model_not_found", message: "sensitive model body" },
        "sensitive model message",
        new Headers({ "x-request-id": "req_model" }),
      ),
      status: "model_unavailable",
      httpStatus: 404,
      requestId: "req_model",
    },
  ])("classifies $label errors without leaking provider details", async (testCase) => {
    const { clientFactory } = clientRejecting(testCase.error);

    const result = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(),
      clientFactory,
    });

    expect(result).toEqual({
      configured: true,
      transport: "direct_openai",
      requestedModel: MODEL,
      status: testCase.status,
      httpStatus: testCase.httpStatus,
      requestId: testCase.requestId,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("sensitive");
    expect(serialized).not.toContain("invalid_api_key");
    expect(serialized).not.toContain("insufficient_quota");
  });

  it("classifies official timeout and model-code errors", async () => {
    const timeout = clientRejecting(
      new APIConnectionTimeoutError({ message: "sensitive timeout message" }),
    );
    const timeoutResult = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(),
      clientFactory: timeout.clientFactory,
    });
    expect(timeoutResult.status).toBe("timeout");
    expect(timeoutResult).not.toHaveProperty("httpStatus");

    const modelError = clientRejecting(
      new APIError(
        400,
        { code: "invalid_model", message: "sensitive model body" },
        "sensitive model message",
        new Headers({ "x-request-id": "req_invalid_model" }),
      ),
    );
    const modelResult = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(),
      clientFactory: modelError.clientFactory,
    });
    expect(modelResult).toMatchObject({
      status: "model_unavailable",
      httpStatus: 400,
      requestId: "req_invalid_model",
    });
  });

  it("collapses unknown errors and malformed success bodies to provider_error", async () => {
    const rejected = clientRejecting(new Error("sensitive internal detail"));
    const rejectedResult = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(),
      clientFactory: rejected.clientFactory,
    });
    expect(rejectedResult.status).toBe("provider_error");
    expect(JSON.stringify(rejectedResult)).not.toContain("sensitive");

    const malformedResult = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(),
      clientFactory: () => ({
        models: { retrieve: vi.fn().mockResolvedValue({ object: "model" }) },
      }),
    });
    expect(malformedResult.status).toBe("provider_error");
  });

  it("does not request or echo an unsafe configured model value", async () => {
    const clientFactory = vi.fn();
    const unsafeModel = `${SECRET} with spaces`;

    const result = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(unsafeModel),
      clientFactory,
    });

    expect(result).toEqual({
      configured: true,
      transport: "direct_openai",
      requestedModel: "invalid",
      status: "model_unavailable",
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("drops unsafe request identifiers instead of reflecting them", async () => {
    const error = Object.assign(new Error("sensitive"), {
      name: "AuthenticationError",
      status: 401,
      requestID: "unsafe request id with spaces",
    });
    const { clientFactory } = clientRejecting(error);

    const result = await diagnoseOpenAiProvider({
      environment: configuredEnvironment(),
      clientFactory,
    });

    expect(result.status).toBe("auth_error");
    expect(result.httpStatus).toBe(401);
    expect(result).not.toHaveProperty("requestId");
  });
});
