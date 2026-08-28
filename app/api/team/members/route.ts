import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/write";
import { requireCurrentUser } from "@/lib/auth/current-user";
import {
  addTeamMember,
  findOwnerForMember,
  loadTeam,
  removeTeamMember,
  type InviteFailure,
} from "@/lib/data/plan-teams";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const dynamic = "force-dynamic";

const EmailSchema = z
  .object({ email: z.string().trim().email().max(254) })
  .strict();

const MemberIdSchema = z
  .object({
    memberUserId: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu),
  })
  .strict();

const ACCOUNT_REQUIRED = {
  error: "Für ein Team ist ein Konto erforderlich.",
  reason: "account_required" as const,
};

/**
 * Die Ablehnungen sind bewusst unterschiedlich formuliert. "Noch kein Konto"
 * ist keine Fehlermeldung, sondern eine Handlungsanweisung an den
 * Einladenden — er muss die Person selbst anschreiben.
 */
const INVITE_MESSAGES: Record<InviteFailure, string> = {
  not_registered:
    "Diese Adresse gehört noch zu keinem XPORTAL-Konto. Laden Sie Ihr Teammitglied ein, sich anzumelden — danach können Sie es hier hinzufügen.",
  already_in_team: "Dieses Konto gehört bereits zu einem Team.",
  owns_a_team:
    "Dieses Konto führt selbst ein Team und kann keinem zweiten beitreten.",
  self: "Sie sind bereits der Inhaber dieses Plans.",
  team_full: "Ihr Plan hat die maximale Anzahl an Teammitgliedern erreicht.",
};

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json(ACCOUNT_REQUIRED, { status: 403 });
    }

    // Ein Mitglied sieht das Team, zu dem es gehört — nicht ein eigenes.
    const ownerUserId = await findOwnerForMember(user.id);
    const team = await loadTeam(ownerUserId ?? user.id);
    return NextResponse.json(
      { team, isOwner: ownerUserId === null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Ihr Team konnte nicht geladen werden." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json(ACCOUNT_REQUIRED, { status: 403 });
    }
    if (await findOwnerForMember(user.id)) {
      return NextResponse.json(
        {
          error: "Nur der Plan-Inhaber kann Mitglieder hinzufügen.",
          reason: "not_owner",
        },
        { status: 403 },
      );
    }

    const input = EmailSchema.parse(await readJsonWithLimit(request, 2_000));
    const result = await addTeamMember({
      ownerUserId: user.id,
      email: input.email,
    });

    if (!result.ok) {
      await writeAuditEvent({
        actorUserId: user.id,
        action: "plan_team_member_invite_rejected",
        targetType: "user_account",
        outcome: "denied",
        metadata: { reason: result.reason },
      });
      return NextResponse.json(
        { error: INVITE_MESSAGES[result.reason], reason: result.reason },
        // "Noch kein Konto" ist kein Rechtefehler, sondern ein Zustand der
        // angefragten Adresse.
        { status: result.reason === "not_registered" ? 404 : 409 },
      );
    }

    await writeAuditEvent({
      actorUserId: user.id,
      action: "plan_team_member_added",
      targetType: "user_account",
      targetId: result.member.userId,
      outcome: "success",
      required: true,
    });

    return NextResponse.json(
      { team: await loadTeam(user.id), isOwner: true },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Bitte geben Sie eine gültige E-Mail-Adresse an." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Das Teammitglied konnte nicht hinzugefügt werden." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (user.isAnonymous) {
      return NextResponse.json(ACCOUNT_REQUIRED, { status: 403 });
    }
    const input = MemberIdSchema.parse(await readJsonWithLimit(request, 2_000));

    // Ein Mitglied darf sich selbst herausnehmen; sonst entscheidet der
    // Inhaber. Beides läuft über dieselbe Zeile.
    const ownerUserId =
      input.memberUserId === user.id
        ? await findOwnerForMember(user.id)
        : user.id;
    if (!ownerUserId) {
      return NextResponse.json(
        { error: "Sie gehören zu keinem Team.", reason: "not_in_team" },
        { status: 404 },
      );
    }

    const removed = await removeTeamMember({
      ownerUserId,
      memberUserId: input.memberUserId,
    });
    if (!removed) {
      return NextResponse.json(
        { error: "Dieses Mitglied gehört nicht zu Ihrem Team." },
        { status: 404 },
      );
    }

    await writeAuditEvent({
      actorUserId: user.id,
      action: "plan_team_member_removed",
      targetType: "user_account",
      targetId: input.memberUserId,
      outcome: "success",
      required: true,
    });

    return NextResponse.json({
      team: await loadTeam(ownerUserId),
      isOwner: ownerUserId === user.id,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Das Teammitglied konnte nicht entfernt werden." },
      { status: 503 },
    );
  }
}
