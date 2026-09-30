import "server-only";

/**
 * Ein schmaler Zugang zur Stripe-API, ohne SDK.
 *
 * Bisher sprach XPORTAL Stripe nur über Zahlungslinks und den Webhook an und
 * brauchte keinen geheimen Schlüssel. Für Rechnungen über das
 * Vermittlungshonorar legt der Server jetzt selbst Kunde und Rechnung an. Ein
 * paar Formular-POSTs rechtfertigen keine zusätzliche Abhängigkeit.
 *
 * Die API-Version ist fest, damit sich Feldnamen nicht mit der
 * Kontoeinstellung ändern. Schreibende Aufrufe tragen einen
 * Idempotenzschlüssel: Ein wiederholter Klick oder ein abgebrochener Versuch
 * legt nichts doppelt an.
 */

const STRIPE_API = "https://api.stripe.com/v1";
export const STRIPE_API_VERSION = "2024-06-20";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export class StripeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "StripeRequestError";
  }
}

type Param = string | number | boolean | null | undefined | Param[] | { [key: string]: Param };

/** Stripe erwartet verschachtelte Werte als `a[b][0]=…`. */
export function encodeStripeParams(params: Record<string, Param>): URLSearchParams {
  const body = new URLSearchParams();
  const add = (key: string, value: Param) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => add(`${key}[${index}]`, item));
      return;
    }
    if (typeof value === "object") {
      for (const [child, childValue] of Object.entries(value)) add(`${key}[${child}]`, childValue);
      return;
    }
    body.append(key, String(value));
  };
  for (const [key, value] of Object.entries(params)) add(key, value);
  return body;
}

export async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, Param> = {},
  options: { idempotencyKey?: string } = {},
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new StripeRequestError(503, "not_configured", "Stripe ist nicht eingerichtet (STRIPE_SECRET_KEY).");

  const body = encodeStripeParams(params);
  const url = method === "GET" && body.size ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "stripe-version": STRIPE_API_VERSION,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    body: method === "POST" ? body : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new StripeRequestError(
      response.status,
      payload.error?.code ?? null,
      payload.error?.message ?? `Stripe antwortete mit ${response.status}.`,
    );
  }
  return payload as T;
}
