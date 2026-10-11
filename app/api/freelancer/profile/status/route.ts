import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { changeOwnedProfileState } from "@/lib/freelancer/profile-data";
import { FREELANCER_COMMAND_DONE } from "@/lib/freelancer/presence";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({ command: z.enum(["publish", "pause", "push"]) }).strict();
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Ein Klick auf das eigene Profil: veröffentlichen, pausieren oder pushen
 * (Verfügbarkeit bestätigen). Aus dem Bewerber-Portal und der Seitenleiste
 * des Chats, ohne das ganze Profilformular zu speichern.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json({ error: "Ein dauerhaftes Konto ist erforderlich." }, { status: 403, headers: NO_STORE });
    }
    const parsed = InputSchema.safeParse(await readJsonWithLimit(request, 1_000));
    if (!parsed.success) {
      return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400, headers: NO_STORE });
    }
    const { command } = parsed.data;
    const state = await changeOwnedProfileState(user.id, command);
    await writeAuditEvent({
      actorUserId: user.id,
      action: `freelancer_profile_${command}`,
      targetType: "freelancer_profile",
      targetId: null,
      outcome: "success",
    }).catch(() => undefined);
    return NextResponse.json({ ...state, message: FREELANCER_COMMAND_DONE[command] }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: await error.text() }, { status: error.status, headers: NO_STORE });
    }
    return NextResponse.json({ error: "Das Profil konnte gerade nicht geändert werden." }, { status: 503, headers: NO_STORE });
  }
}
