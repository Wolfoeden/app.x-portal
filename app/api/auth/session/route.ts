import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { presentWorkspaceAuth } from "@/lib/data/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(presentWorkspaceAuth(await getCurrentUser()), {
    headers: { "Cache-Control": "no-store" },
  });
}
