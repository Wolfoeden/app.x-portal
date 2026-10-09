import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { checkoutPlan } from "@/lib/billing/subscription";
import { redeemRecruitingVoucher } from "@/lib/billing/voucher";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonWithLimit(request, 1_000) as {
      code?: unknown;
      plan?: unknown;
    };
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const plan = checkoutPlan(body.plan);
    if (!code || code.length > 64 || !plan) {
      return NextResponse.json({ status: "invalid" }, { status: 400 });
    }

    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json({ status: "login_required" }, { status: 401 });
    }

    const result = await redeemRecruitingVoucher({
      userId: user.id,
      code,
      planId: plan,
    });
    const stillActive = Boolean(
      result.trialEnd && new Date(result.trialEnd).getTime() > Date.now(),
    );
    const accepted = result.status === "redeemed" ||
      (result.status === "already_redeemed" && stillActive);

    return NextResponse.json(
      { ...result, accepted },
      {
        status: accepted
          ? 200
          : result.status === "invalid"
            ? 400
            : 409,
        headers: { "cache-control": "private, no-store" },
      },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
