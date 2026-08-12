import "server-only";

import OpenAI from "openai";

export const OPENAI_OFFICIAL_BASE_URL = "https://api.openai.com/v1";

export type OpenAiTransport =
  | "unconfigured"
  | "direct_openai"
  | "netlify_ai_gateway"
  | "custom_gateway";

type OpenAiEnvironment = {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
};

export type OpenAiConnection = {
  configured: boolean;
  transport: OpenAiTransport;
  baseUrl: string | null;
};

function normalizedBaseUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/u, "");
  } catch {
    return candidate.replace(/\/$/u, "");
  }
}

/**
 * Exposes only non-secret provider metadata. Netlify AI Gateway injects an
 * OPENAI_BASE_URL at runtime; a customer-owned key without that override uses
 * the official OpenAI API directly.
 */
export function resolveOpenAiConnection(
  environment: OpenAiEnvironment = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  },
): OpenAiConnection {
  const configured = Boolean(environment.OPENAI_API_KEY?.trim());
  if (!configured) {
    return { configured: false, transport: "unconfigured", baseUrl: null };
  }

  const baseUrl = normalizedBaseUrl(environment.OPENAI_BASE_URL);
  if (!baseUrl || baseUrl === OPENAI_OFFICIAL_BASE_URL) {
    return {
      configured: true,
      transport: "direct_openai",
      baseUrl: OPENAI_OFFICIAL_BASE_URL,
    };
  }

  const transport = /(?:netlify|ai-gateway)/iu.test(baseUrl)
    ? "netlify_ai_gateway"
    : "custom_gateway";
  return { configured: true, transport, baseUrl };
}

export function createOpenAiClient(apiKey: string): OpenAI {
  const baseUrl = normalizedBaseUrl(process.env.OPENAI_BASE_URL);
  return new OpenAI({
    apiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });
}
