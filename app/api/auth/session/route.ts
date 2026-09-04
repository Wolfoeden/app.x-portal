import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { presentWorkspaceAuth } from "@/lib/data/workspace";
import { loadFreelancerPresence } from "@/lib/freelancer/profile-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  // Auch hier, nicht nur beim ersten Laden: Der Arbeitsbereich fragt diese
  // Route nach einer Anmeldung erneut ab, und danach soll die Beschriftung
  // des Freelancer-Einstiegs sofort stimmen. Ein Fehlschlag laesst sie auf
  // "none" stehen, statt die Sitzungsauskunft scheitern zu lassen.
  const freelancer =
    user && !user.isAnonymous
      ? await loadFreelancerPresence(user.id).catch(() => "none" as const)
      : ("none" as const);

  return NextResponse.json(presentWorkspaceAuth(user, freelancer), {
    headers: { "Cache-Control": "no-store" },
  });
}
