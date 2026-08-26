import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getAdminUsageDashboard } from "@/lib/ai/admin-usage";
import { csvFilename, csvNumber, toCsv } from "@/lib/ai/usage-csv";
import { writeAuditEvent } from "@/lib/audit/write";
import { requireAdminUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TableSchema = z.enum(["nutzer", "modelle", "aktivitaeten"]);

const IsoDateSchema = z
  .string()
  .trim()
  .datetime({ offset: true })
  .optional();

function nanoToCents(nanoUsd: string | number | null): number {
  const value = typeof nanoUsd === "string" ? Number(nanoUsd) : nanoUsd ?? 0;
  return Number.isFinite(value) ? value / 1e7 : 0;
}

export async function GET(request: Request) {
  const traceId = randomUUID();
  try {
    const user = await requireAdminUser();
    const url = new URL(request.url);
    const table = TableSchema.parse(url.searchParams.get("tabelle") ?? "nutzer");
    const from = IsoDateSchema.parse(url.searchParams.get("von") ?? undefined);
    const to = IsoDateSchema.parse(url.searchParams.get("bis") ?? undefined);

    const dashboard = await getAdminUsageDashboard({ from, to });

    let columns: string[];
    let rows: unknown[][];

    if (table === "nutzer") {
      columns = [
        "Konto",
        "Art",
        "E-Mail",
        "Token gesamt",
        "Token-Kosten (ct)",
        "Websuchen",
        "Suchaufrufe",
        "Suchkosten (ct)",
        "Gesamtkosten (ct)",
        "Zuletzt aktiv",
      ];
      rows = dashboard.users.map((entry) => {
        const tokens =
          entry.confirmedProvider.totalTokens +
          entry.estimatedOrReconciled.totalTokens;
        const tokenCents =
          nanoToCents(entry.confirmedProvider.costNanoUsd) +
          nanoToCents(entry.estimatedOrReconciled.costNanoUsd);
        const searchCents = entry.searchToolCalls;
        return [
          entry.userId,
          entry.anonymous ? "Gast" : "angemeldet",
          entry.email ?? "",
          csvNumber(tokens),
          csvNumber(tokenCents, 3),
          csvNumber(entry.searchRuns),
          csvNumber(entry.searchToolCalls),
          csvNumber(searchCents, 3),
          csvNumber(tokenCents + searchCents, 3),
          entry.lastUsedAt ?? "",
        ];
      });
    } else if (table === "modelle") {
      columns = [
        "Modell",
        "Anfragen",
        "Eingabe-Token",
        "gecachte Eingabe",
        "Ausgabe-Token",
        "Token gesamt",
        "Kosten (ct)",
      ];
      rows = dashboard.byModel.map((entry) => [
        entry.key,
        csvNumber(
          entry.confirmedProvider.requests + entry.estimatedOrReconciled.requests,
        ),
        csvNumber(
          entry.confirmedProvider.inputTokens +
            entry.estimatedOrReconciled.inputTokens,
        ),
        csvNumber(
          entry.confirmedProvider.cachedInputTokens +
            entry.estimatedOrReconciled.cachedInputTokens,
        ),
        csvNumber(
          entry.confirmedProvider.outputTokens +
            entry.estimatedOrReconciled.outputTokens,
        ),
        csvNumber(
          entry.confirmedProvider.totalTokens +
            entry.estimatedOrReconciled.totalTokens,
        ),
        csvNumber(
          nanoToCents(entry.confirmedProvider.costNanoUsd) +
            nanoToCents(entry.estimatedOrReconciled.costNanoUsd),
          3,
        ),
      ]);
    } else {
      columns = [
        "Zeitpunkt",
        "Konto",
        "E-Mail",
        "Zweck",
        "Modell",
        "Token",
        "Kosten (ct)",
        "Ergebnis",
      ];
      rows = dashboard.recentInteractions.map((entry) => [
        entry.settledAt,
        entry.userId ?? "",
        entry.email ?? "",
        entry.purpose,
        entry.model,
        csvNumber(entry.tokens),
        csvNumber(nanoToCents(entry.costNanoUsd), 3),
        entry.outcome,
      ]);
    }

    await writeAuditEvent({
      actorUserId: user.id,
      action: "ai_usage_export_downloaded",
      targetType: "ai_usage",
      outcome: "success",
      traceId,
      metadata: { table, rows: rows.length },
      required: true,
    });

    return new Response(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(table, dashboard.generatedAt)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return new Response("Ungültige Auswahl.", { status: 400 });
    }
    return new Response("Export nicht verfügbar.", { status: 503 });
  }
}
