import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  consumeGuestClaim,
  GUEST_CLAIM_COOKIE,
} from "@/lib/auth/guest-claim";
import { applicationDestination } from "@/lib/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedTypes = new Set<EmailOtpType>([
  "email_change",
  "signup",
  "magiclink",
  "recovery",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const candidateType = url.searchParams.get("type") as EmailOtpType | null;
  const destination = applicationDestination(
    request,
    url.searchParams.get("next"),
  );

  if (!tokenHash || !candidateType || !allowedTypes.has(candidateType)) {
    destination.searchParams.set("auth_error", "invalid_confirmation");
    return NextResponse.redirect(destination);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: candidateType,
  });
  if (error) {
    destination.searchParams.set("auth_error", "confirmation_failed");
    return NextResponse.redirect(destination);
  }

  const { data } = await supabase.auth.getClaims();
  const targetUserId = data?.claims?.sub;
  const cookieStore = await cookies();
  const claimToken = cookieStore.get(GUEST_CLAIM_COOKIE)?.value;
  let claimConsumed = false;
  if (targetUserId && claimToken) {
    try {
      claimConsumed = await consumeGuestClaim(claimToken, targetUserId);
      if (!claimConsumed) {
        destination.searchParams.set("claim_warning", "transfer_pending");
      }
    } catch {
      destination.searchParams.set("claim_warning", "transfer_pending");
    }
  }

  const response = NextResponse.redirect(destination);
  if (claimConsumed) response.cookies.delete(GUEST_CLAIM_COOKIE);
  return response;
}
