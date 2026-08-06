import { createHmac } from "node:crypto";

import type { NextRequest } from "next/server";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function assertSameOrigin(request: Request) {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
    : requestOrigin;

  if (origin && origin !== requestOrigin && origin !== configuredOrigin) {
    throw new Response("Origin not allowed", { status: 403 });
  }
}

export async function readJsonWithLimit(
  request: Request,
  maximumBytes = 32_000,
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Response("Request body too large", { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new Response("Request body too large", { status: 413 });
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Response("Invalid JSON", { status: 400 });
  }
}

export function getClientIp(request: NextRequest | Request) {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  ).slice(0, 128);
}

export function pseudonymizeSubject(subject: string) {
  const secret = process.env.IP_HASH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("IP_HASH_SECRET must contain at least 32 characters.");
    }

    return createHmac("sha256", "local-development-only")
      .update(subject)
      .digest("hex");
  }

  return createHmac("sha256", secret).update(subject).digest("hex");
}

export function pseudonymizeIp(ipAddress: string) {
  return pseudonymizeSubject(`ip:${ipAddress}`);
}

export function logEvent(
  event: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  console.info(
    JSON.stringify({
      time: new Date().toISOString(),
      event,
      ...metadata,
    }),
  );
}
