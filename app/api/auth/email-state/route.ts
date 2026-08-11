import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  EMAIL_AUTH_STATE_COOKIE,
  emailAuthStatesMatch,
} from "@/lib/auth/email-state";
import { assertSameOrigin } from "@/lib/security/request";

const stateSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});

function stateCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCurrentUser();
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.json({ state });
    response.cookies.set(EMAIL_AUTH_STATE_COOKIE, state, stateCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Email state unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await requireCurrentUser();
    const parsed = stateSchema.safeParse(await request.json().catch(() => null));
    const cookieStore = await cookies();
    const expected = cookieStore.get(EMAIL_AUTH_STATE_COOKIE)?.value;

    if (!parsed.success || !expected || !emailAuthStatesMatch(expected, parsed.data.state)) {
      return NextResponse.json({ verified: false }, { status: 403 });
    }

    const response = NextResponse.json({ verified: true });
    response.cookies.delete(EMAIL_AUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Email state verification failed" }, { status: 503 });
  }
}
