import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  consumeGuestClaim,
  GUEST_CLAIM_COOKIE,
} from "@/lib/auth/guest-claim";
import { assertSameOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json(
        { error: "Permanent account required" },
        { status: 409 },
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(GUEST_CLAIM_COOKIE)?.value;
    if (!token) {
      return NextResponse.json(
        { claimed: false, reason: "claim_cookie_missing" },
        { status: 409 },
      );
    }

    const claimed = await consumeGuestClaim(token, user.id);
    if (!claimed) {
      return NextResponse.json(
        { claimed: false, reason: "claim_invalid_or_expired" },
        { status: 409 },
      );
    }
    const response = NextResponse.json({ claimed: true });
    response.cookies.delete(GUEST_CLAIM_COOKIE);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Claim failed" }, { status: 503 });
  }
}
