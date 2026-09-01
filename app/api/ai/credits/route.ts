import { NextResponse } from "next/server";

import { getAccountPlanId } from "@/lib/ai/quota";
import {
  parseSelfLimit,
  readSelfCreditLimit,
  setSelfCreditLimit,
  SELF_LIMIT_MAX_EURO,
} from "@/lib/ai/self-limit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { loadWorkspaceUsage } from "@/lib/data/workspace";
import { assertSameOrigin, readJsonWithLimit } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const usage = await loadWorkspaceUsage(user);
    // Das Limit reist neben der Momentaufnahme mit, damit die Einstellung nach
    // einem Neuladen den gespeicherten Wert zeigt und nicht ein leeres Feld.
    const selfLimit = user.isAnonymous ? null : await readSelfCreditLimit(user.id);
    return NextResponse.json(
      { ...usage, selfLimit, selfLimitMaxEuro: SELF_LIMIT_MAX_EURO },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Nutzungskontingent ist vorübergehend nicht verfügbar." },
      { status: 503, headers: NO_STORE },
    );
  }
}

/**
 * Das selbst gesetzte Limit ändern.
 *
 * `null` heißt ausdrücklich "kein Limit" und ist etwas anderes als 0 — die
 * Null wäre ein Konto, das nichts mehr darf. Ein geleertes Feld darf den
 * Zugang nicht abschalten, deshalb unterscheidet die Route beides.
 */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const payload = await readJsonWithLimit(request, 1_000);
    const limit = parseSelfLimit(
      (payload as { limit?: unknown } | null)?.limit ?? null,
    );
    if (limit === "invalid") {
      return NextResponse.json(
        { error: "Bitte geben Sie eine Zahl innerhalb Ihres Kontingents an." },
        { status: 400, headers: NO_STORE },
      );
    }

    const planId = await getAccountPlanId({
      userId: user.id,
      isAnonymous: user.isAnonymous,
    });
    const result = await setSelfCreditLimit({
      userId: user.id,
      isAnonymous: user.isAnonymous,
      planId,
      limit,
    });

    if (!result.ok) {
      const status = result.reason === "not_entitled" ? 403 : result.reason === "out_of_range" ? 400 : 503;
      return NextResponse.json(
        {
          error:
            result.reason === "not_entitled"
              ? "Ein Limit lässt sich nur auf einem abgerechneten Plan setzen."
              : result.reason === "out_of_range"
                ? "Bitte geben Sie eine Zahl innerhalb Ihres Kontingents an."
                : "Das Limit konnte gerade nicht gespeichert werden.",
        },
        { status, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      { limit: result.limit, creditsTotal: result.creditsTotal },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: "Das Limit konnte gerade nicht gespeichert werden." },
      { status: 503, headers: NO_STORE },
    );
  }
}
