import { NextResponse, after } from "next/server";

import { writeAuditEvent } from "@/lib/audit/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadPublicProfileView } from "@/lib/freelancer/public-profile";
import { getClientIp, pseudonymizeIp } from "@/lib/security/request";
import { consumeRateLimit } from "@/lib/security/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const VIA = new Set(["shortcut", "results", "saved", "link"]);

/**
 * Das vollständige Profil für das Seitenpanel im Chat. Öffentlich wie
 * `/profil/<id>`: nur aktive, echte Profile, ohne Kalenderadresse im
 * Klartext. Wie oft das Panel geöffnet wird und woher (`?via=`), zählt ein
 * Protokolleintrag nach der Antwort.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

  const limit = await consumeRateLimit(`freelancer-dossier:${pseudonymizeIp(getClientIp(request))}`, 240, 60 * 60_000).catch(
    () => ({ allowed: true, retryAfterSeconds: 0 }),
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Zu viele Aufrufe. Bitte gleich noch einmal." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const view = await loadPublicProfileView(id).catch(() => null);
  if (!view) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

  const viaParam = new URL(request.url).searchParams.get("via");
  const via = viaParam && VIA.has(viaParam) ? viaParam : null;
  after(async () => {
    const user = await getCurrentUser().catch(() => null);
    await writeAuditEvent({
      actorUserId: user?.id ?? null,
      action: "profile_panel_opened",
      targetType: "freelancer_profile",
      targetId: id,
      outcome: "success",
      metadata: { via, account: !user ? "none" : user.isAnonymous ? "guest" : "registered" },
    }).catch(() => undefined);
  });

  return NextResponse.json(
    { dossier: view.dossier },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
