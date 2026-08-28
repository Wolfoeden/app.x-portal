import { createHmac } from "node:crypto";

import { getContext } from "@netlify/functions";
import type { NextRequest } from "next/server";

import { applicationOrigin } from "@/lib/auth/redirect";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * `Sec-Fetch-Site` gehört zu den verbotenen Headern: Seitenskript kann ihn
 * nicht setzen, der Browser schreibt ihn selbst. Damit ist er als Aussage über
 * die Herkunft mindestens so belastbar wie `Origin` — und er ist auch dann da,
 * wenn `Origin` unterwegs verloren geht.
 */
const SAME_SITE_FETCH_VALUES = new Set(["same-origin", "same-site"]);

export function assertSameOrigin(request: Request) {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return;

  const fetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (fetchSite && !SAME_SITE_FETCH_VALUES.has(fetchSite)) {
    throw new Response("Origin not allowed", { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // Bisher lief eine Anfrage ohne `Origin` einfach durch. Das machte aus der
    // einen Funktion, deren einzige Aufgabe das Ablehnen ist, ein Fail-open:
    // Wer den Header wegließ, war damit durch. Ein vom Browser gesetztes
    // `Sec-Fetch-Site` ist der einzige akzeptierte Ersatz; fehlt auch das,
    // wird abgelehnt.
    if (fetchSite && SAME_SITE_FETCH_VALUES.has(fetchSite)) return;
    throw new Response("Origin required", { status: 403 });
  }

  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = applicationOrigin(request);
  const host = request.headers.get("host")?.trim();
  let hostOrigin: string | null = null;
  if (host) {
    try {
      hostOrigin = new URL(`${new URL(request.url).protocol}//${host}`).origin;
    } catch {
      hostOrigin = null;
    }
  }

  if (
    origin !== requestOrigin &&
    origin !== configuredOrigin &&
    origin !== hostOrigin
  ) {
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
  try {
    const netlifyIp = getContext().ip?.trim();
    if (netlifyIp) return netlifyIp.slice(0, 128);
  } catch {
    // Expected outside an active Netlify Functions request.
  }

  if (process.env.NETLIFY === "true") {
    return (
      request.headers.get("x-nf-client-connection-ip")?.trim() || "unknown"
    ).slice(0, 128);
  }

  // Generic forwarding headers are safe only when an explicitly trusted
  // ingress strips client-supplied values. Local development enables them for
  // convenience; other production hosts must opt in after proxy verification.
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.TRUST_PROXY_IP_HEADERS === "true"
  ) {
    return (
      request.headers.get("x-real-ip")?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown"
    ).slice(0, 128);
  }

  return "unknown";
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
