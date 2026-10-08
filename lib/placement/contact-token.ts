import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TTL_MS = 7 * 24 * 60 * 60_000;

function key(): Buffer | null {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  return secret && secret.length >= 32
    ? createHmac("sha256", secret).update("recruiting-contact-consent-v1").digest()
    : null;
}

export function contactRecipientHash(email: string): string | null {
  const secret = key();
  return secret ? createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 24) : null;
}

export function mintContactToken(requestId: string, now = Date.now(), recipientEmail = ""): string | null {
  const secret = key();
  if (!secret || !UUID.test(requestId)) return null;
  const payload = `${requestId.toLowerCase()}:${now + TTL_MS}:${contactRecipientHash(recipientEmail)}`;
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

export function readContactToken(token: unknown, now = Date.now()): { requestId: string; recipientHash: string } | null {
  const secret = key();
  if (!secret || typeof token !== "string" || token.length > 200) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !/^[A-Za-z0-9_-]+$/u.test(encoded)) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(encoded).digest("base64url"));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  const [id, expires, recipientHash, extraPayload] = Buffer.from(encoded, "base64url").toString("utf8").split(":");
  const expiresAt = Number(expires);
  if (!UUID.test(id ?? "") || !/^[a-f0-9]{24}$/u.test(recipientHash || "") || extraPayload || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + TTL_MS) return null;
  return { requestId: id, recipientHash };
}
