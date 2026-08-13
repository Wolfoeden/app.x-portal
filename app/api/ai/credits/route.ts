import { NextResponse } from "next/server";

import {
  getMonthlyAiUsageSnapshot,
  getProductCreditSnapshot,
  PRODUCT_CREDIT_EURO_PER_UNIT,
} from "@/lib/ai/product-entitlements";
import { requireCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const [freeUsage, productCredits] = await Promise.all([
      getMonthlyAiUsageSnapshot({
        userId: user.id,
        isAnonymous: user.isAnonymous,
      }),
      user.isAnonymous
        ? Promise.resolve(null)
        : getProductCreditSnapshot(user.id),
    ]);
    return NextResponse.json(
      {
        freeUsage: {
          ...freeUsage,
          exhausted: freeUsage.remaining <= 0,
        },
        productCredits: productCredits
          ? {
              ...productCredits,
              euroPerCredit: PRODUCT_CREDIT_EURO_PER_UNIT,
            }
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Nutzungskontingent ist vorübergehend nicht verfügbar." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
