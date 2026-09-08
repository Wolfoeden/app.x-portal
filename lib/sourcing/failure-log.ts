import "server-only";

import { writeAuditEvent } from "@/lib/audit/write";

/**
 * Ein gescheiterter Vorgang hinterlässt eine Spur.
 *
 * Der Anlass ist ein Fehler, den ich an einem Tag dreimal gemacht habe: aus
 * dem Ausbleiben einer Meldung auf Erfolg zu schließen. Die Beschaffungsroute
 * schrieb ihr Audit-Ereignis erst **nach** dem Lauf. Als der Lauf an der
 * Zeitgrenze der Plattform abbrach, stand im Protokoll nichts — und das sah
 * genauso aus, als hätte niemand den Knopf gedrückt. Roman hat ihn siebenmal
 * gedrückt.
 *
 * Die Regel, die daraus folgt und für alles Weitere gilt: **Ein Vorgang, der
 * nichts hinterlässt, gilt als nicht gelaufen.** Deshalb schreibt jeder
 * `catch`-Zweig dieser Routen von hier aus ein Ereignis, bevor er antwortet.
 */

/** Die Meldung eines Fehlers, so knapp wie sie brauchbar ist. */
export function failureDetail(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? `${error.name}: ` : "";
    return `${name}${error.message}`.slice(0, 500);
  }
  if (typeof error === "string") return error.slice(0, 500);
  return "unbekannter Fehler";
}

/**
 * Hält einen gescheiterten Beschaffungsvorgang fest.
 *
 * Wirft nie. Ein Protokolleintrag, der seinerseits scheitert, darf die
 * Fehlerantwort an den Betreiber nicht verschlucken — dann stünde er wieder
 * vor einem stummen Knopf.
 */
export async function logSourcingFailure(input: {
  actorUserId: string | null;
  action: string;
  targetId?: string | null;
  traceId: string;
  error: unknown;
  /** Woran der Lauf war, als es schiefging. */
  stage?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await writeAuditEvent({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: "search_demand",
    targetId: input.targetId ?? null,
    outcome: "failed",
    traceId: input.traceId,
    metadata: {
      ...(input.metadata ?? {}),
      stage: input.stage ?? "unknown",
      detail: failureDetail(input.error),
    },
  }).catch(() => undefined);
}
