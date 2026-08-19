import "server-only";

import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { pseudonymizeSubject } from "@/lib/security/request";

import { CV_BUCKET } from "./limits";

export const CV_OBJECT_PATH_PATTERN =
  /^incoming\/[0-9a-f-]{36}\/[0-9a-f]{32}\.pdf$/u;

/**
 * The browser uploads the CV straight to Supabase Storage with a short-lived
 * signed token, so a multi-megabyte file never travels through a serverless
 * function body. The object key is minted here and handed back to the client
 * together with an HMAC, which the submit route re-checks: without it a client
 * could claim any existing object as its own CV.
 */
export function mintCvObjectPath() {
  return `incoming/${randomUUID()}/${randomBytes(16).toString("hex")}.pdf`;
}

export function signCvObjectPath(objectPath: string): string {
  return pseudonymizeSubject(`freelancer-cv:${objectPath}`);
}

export function verifyCvObjectPath(objectPath: string, token: string): boolean {
  if (!CV_OBJECT_PATH_PATTERN.test(objectPath)) return false;
  if (!/^[0-9a-f]{64}$/u.test(token)) return false;

  const expected = Buffer.from(signCvObjectPath(objectPath), "utf8");
  const provided = Buffer.from(token, "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export { CV_BUCKET };
