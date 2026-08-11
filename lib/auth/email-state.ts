import "server-only";

import { timingSafeEqual } from "node:crypto";

export const EMAIL_AUTH_STATE_COOKIE = "xportal_email_auth_state";

export function emailAuthStatesMatch(expected: string, candidate: string) {
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  return (
    expectedBuffer.length === candidateBuffer.length &&
    timingSafeEqual(expectedBuffer, candidateBuffer)
  );
}
