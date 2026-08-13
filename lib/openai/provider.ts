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

/**
 * Exposes only non-secret provider metadata. This product deliberately uses
 * the customer-owned key against the official OpenAI endpoint. Platform or
 * inherited OPENAI_BASE_URL values cannot reroute requests to a gateway.
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

  return {
    configured: true,
    transport: "direct_openai",
    baseUrl: OPENAI_OFFICIAL_BASE_URL,
  };
}

export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: OPENAI_OFFICIAL_BASE_URL,
  });
}
