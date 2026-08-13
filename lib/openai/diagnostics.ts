import "server-only";

import {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";

import {
  createOpenAiClient,
  resolveOpenAiConnection,
  type OpenAiTransport,
} from "./provider";

export const DEFAULT_OPENAI_DIAGNOSTIC_MODEL = "gpt-5.5-pro";

export const OPENAI_DIAGNOSTIC_STATUSES = [
  "unconfigured",
  "auth_error",
  "billing_or_quota",
  "permission",
  "model_unavailable",
  "reachable",
  "timeout",
  "provider_error",
] as const;

export type OpenAiDiagnosticStatus =
  (typeof OPENAI_DIAGNOSTIC_STATUSES)[number];

export interface OpenAiProviderDiagnostic {
  configured: boolean;
  transport: OpenAiTransport;
  requestedModel: string;
  status: OpenAiDiagnosticStatus;
  httpStatus?: number;
  requestId?: string;
}

type OpenAiDiagnosticEnvironment = {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_BRIEF_MODEL?: string;
};

type DiagnosticModelClient = {
  models: {
    retrieve(
      model: string,
      options?: { timeout?: number; maxRetries?: number },
    ): Promise<unknown>;
  };
};

export interface OpenAiDiagnosticOptions {
  timeoutMs?: number;
  /** Test seam; production callers should use the process environment. */
  environment?: OpenAiDiagnosticEnvironment;
  /** Test seam; production uses createOpenAiClient. */
  clientFactory?: (apiKey: string) => DiagnosticModelClient;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u;

function clampTimeout(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs)) return DEFAULT_TIMEOUT_MS;
  return Math.min(
    MAX_TIMEOUT_MS,
    Math.max(MIN_TIMEOUT_MS, Math.trunc(timeoutMs ?? DEFAULT_TIMEOUT_MS)),
  );
}

function safeHttpStatus(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value)
    ? value
    : undefined;
}

function errorField(error: unknown, field: string): unknown {
  if ((typeof error !== "object" && typeof error !== "function") || !error) {
    return undefined;
  }
  try {
    return (error as Record<string, unknown>)[field];
  } catch {
    return undefined;
  }
}

function errorName(error: unknown): string | undefined {
  const name = errorField(error, "name");
  return typeof name === "string" ? name : undefined;
}

function errorCode(error: unknown): string | undefined {
  const code = errorField(error, "code");
  return typeof code === "string" ? code.toLocaleLowerCase("en-US") : undefined;
}

function errorMetadata(
  error: unknown,
): Pick<OpenAiProviderDiagnostic, "httpStatus" | "requestId"> {
  const httpStatus = safeHttpStatus(errorField(error, "status"));
  const requestId =
    safeRequestId(errorField(error, "requestID")) ??
    safeRequestId(errorField(error, "requestId"));
  return {
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

function isNamedError(error: unknown, name: string): boolean {
  return errorName(error) === name;
}

export function classifyOpenAiProviderError(
  error: unknown,
): OpenAiDiagnosticStatus {
  const status = safeHttpStatus(errorField(error, "status"));
  const code = errorCode(error);

  if (
    error instanceof APIConnectionTimeoutError ||
    isNamedError(error, "APIConnectionTimeoutError") ||
    status === 408 ||
    status === 504
  ) {
    return "timeout";
  }
  if (
    error instanceof AuthenticationError ||
    isNamedError(error, "AuthenticationError") ||
    status === 401
  ) {
    return "auth_error";
  }
  if (
    error instanceof RateLimitError ||
    isNamedError(error, "RateLimitError") ||
    status === 402 ||
    status === 429 ||
    (code !== undefined &&
      /(?:billing|credit|quota|rate_limit|usage_limit)/u.test(code))
  ) {
    return "billing_or_quota";
  }
  if (
    error instanceof PermissionDeniedError ||
    isNamedError(error, "PermissionDeniedError") ||
    status === 403
  ) {
    return "permission";
  }
  if (
    error instanceof NotFoundError ||
    isNamedError(error, "NotFoundError") ||
    status === 404 ||
    (code !== undefined &&
      /(?:model_not_found|model_unavailable|invalid_model|deployment_not_found)/u.test(
        code,
      ))
  ) {
    return "model_unavailable";
  }

  // APIError covers the official SDK's remaining provider responses. Unknown
  // transport/runtime errors deliberately collapse to the same safe status.
  if (error instanceof APIError || isNamedError(error, "APIError")) {
    return "provider_error";
  }
  return "provider_error";
}

/**
 * Verifies the configured key and model with GET /models/{model}. This endpoint
 * retrieves metadata only: it does not generate text or consume model tokens.
 */
export async function diagnoseOpenAiProvider(
  options: OpenAiDiagnosticOptions = {},
): Promise<OpenAiProviderDiagnostic> {
  const environment = options.environment ?? {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_BRIEF_MODEL: process.env.OPENAI_BRIEF_MODEL,
  };
  const connection = resolveOpenAiConnection(environment);
  const configuredModel =
    environment.OPENAI_BRIEF_MODEL?.trim() ||
    (options.environment ? environment.OPENAI_MODEL?.trim() : undefined) ||
    DEFAULT_OPENAI_DIAGNOSTIC_MODEL;
  const modelIsSafe = SAFE_MODEL_ID.test(configuredModel);
  const requestedModel = modelIsSafe ? configuredModel : "invalid";
  const baseResult = {
    configured: connection.configured,
    transport: connection.transport,
    requestedModel,
  } satisfies Omit<OpenAiProviderDiagnostic, "status">;

  if (!connection.configured) {
    return { ...baseResult, status: "unconfigured" };
  }
  if (!modelIsSafe) {
    return { ...baseResult, status: "model_unavailable" };
  }

  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      transport: "unconfigured",
      requestedModel,
      status: "unconfigured",
    };
  }

  const clientFactory =
    options.clientFactory ??
    ((key: string): DiagnosticModelClient => {
      const client = createOpenAiClient(key);
      return {
        models: {
          retrieve: (model, requestOptions) =>
            client.models.retrieve(model, requestOptions),
        },
      };
    });

  try {
    const model = await clientFactory(apiKey).models.retrieve(requestedModel, {
      timeout: clampTimeout(options.timeoutMs),
      maxRetries: 0,
    });
    const returnedId =
      typeof model === "object" && model
        ? (model as Record<string, unknown>).id
        : undefined;
    if (typeof returnedId !== "string" || !returnedId.trim()) {
      return { ...baseResult, status: "provider_error" };
    }
    return { ...baseResult, status: "reachable" };
  } catch (error: unknown) {
    return {
      ...baseResult,
      status: classifyOpenAiProviderError(error),
      ...errorMetadata(error),
    };
  }
}
