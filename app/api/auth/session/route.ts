import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    {
      authenticated: user !== null,
      anonymous: user?.isAnonymous ?? true,
      user: user
        ? {
            id: user.id,
            displayName: null,
            email: user.email,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
