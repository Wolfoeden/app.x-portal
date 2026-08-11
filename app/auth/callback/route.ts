import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  consumeGuestClaim,
  GUEST_CLAIM_COOKIE,
} from "@/lib/auth/guest-claim";
import { applicationDestination } from "@/lib/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = applicationDestination(
    request,
    url.searchParams.get("next"),
  );

  if (!code) {
    destination.searchParams.set("auth_error", "missing_code");
    return NextResponse.redirect(destination);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    destination.searchParams.set("auth_error", "exchange_failed");
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
