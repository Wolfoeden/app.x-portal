import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  GUEST_CLAIM_COOKIE,
  hashGuestClaim,
} from "@/lib/auth/guest-claim";
import {
  assertSameOrigin,
  getClientIp,
  pseudonymizeIp,
} from "@/lib/security/request";
import { takeRateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (!user.isAnonymous) {
      return NextResponse.json({ prepared: false, reason: "not_anonymous" });
    }

    const userLimit = takeRateLimit(`guest-claim-user:${user.id}`, 5, 10 * 60_000);
    const ipLimit = takeRateLimit(
      `guest-claim-ip:${pseudonymizeIp(getClientIp(request))}`,
      20,
      10 * 60_000,
    );
    if (!userLimit.allowed || !ipLimit.allowed) {
      const retryAfter = Math.max(
        userLimit.retryAfterSeconds,
        ipLimit.retryAfterSeconds,
      );
      return NextResponse.json(
        { error: "Zu viele Anmeldeversuche. Bitte warten Sie kurz." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1_000).toISOString();
    const admin = createAdminSupabaseClient();
    const { error: replacementError } = await admin
      .from("guest_claims")
      .delete()
      .eq("guest_user_id", user.id)
      .is("consumed_at", null);
    if (replacementError) throw replacementError;
    const { error } = await admin.from("guest_claims").insert({
      guest_user_id: user.id,
      token_hash: hashGuestClaim(token),
      expires_at: expiresAt,
    });
    if (error) throw error;

    const response = NextResponse.json({ prepared: true });
    response.cookies.set(GUEST_CLAIM_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Guest claim unavailable" },
      { status: 503 },
    );
  }
}
