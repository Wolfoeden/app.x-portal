import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Der Link in der Nachfrage-Mail: wer antwortet (Kunde oder Freelancer) zu
 * welcher Vorstellung.
 *
 * Kein Login, weil eine Antwort mit einem Klick gehen soll; stattdessen ein
 * HMAC über Vorgang und Rolle. Der Schlüssel wird aus dem Geheimnis der
 * Abmeldelinks abgeleitet, mit eigenem Zweck: Ein Abmeldetoken taugt so nicht
 * als Antworttoken und umgekehrt.
 *
 * Die Antwort selbst steht nicht im Token. Mailprogramme rufen Links vorab
 * auf, um sie zu prüfen; ein Link, der beim Aufruf schon „beauftragt“
 * speicherte, würde dabei auslösen. Die Seite hinter dem Link fragt deshalb
 * noch einmal, und erst der Klick dort speichert.
 */

export type AnswerRole = "client" | "freelancer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function key(): Buffer | null {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return createHmac("sha256", secret).update("placement-answer-v1").digest();
}

export function answerTokensConfigured(): boolean {
  return key() !== null;
}

function sign(payload: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintAnswerToken(requestId: string, role: AnswerRole): string | null {
  const secret = key();
  if (!secret || !UUID.test(requestId)) return null;
  const payload = `${requestId.toLowerCase()}:${role === "client" ? "c" : "f"}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, secret)}`;
}

export function readAnswerToken(token: unknown): { requestId: string; role: AnswerRole } | null {
  const secret = key();
  if (!secret || typeof token !== "string") return null;
  const value = token.trim();
  if (!value || value.length > 200) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded) || !/^[A-Za-z0-9_-]+$/u.test(signature)) return null;

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = Buffer.from(sign(payload, secret), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  const [requestId, role] = payload.split(":");
  if (!requestId || !UUID.test(requestId) || (role !== "c" && role !== "f")) return null;
  return { requestId, role: role === "c" ? "client" : "freelancer" };
}

export function answerUrl(siteUrl: string, token: string, answer?: string): string {
  const url = new URL("/vermittlung/antwort", siteUrl);
  url.searchParams.set("t", token);
  if (answer) url.searchParams.set("a", answer);
  return url.toString();
}
