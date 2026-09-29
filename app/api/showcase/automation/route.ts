import { NextResponse } from "next/server";

import { EMPTY_AUTOMATION_SHOWCASE } from "@/lib/freelancer/showcase";
import { loadAutomationShowcase } from "@/lib/freelancer/showcase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Selbst angemeldete Freelancer für den Shortcut „KI & Automatisierung“.
 *
 * Ohne Sitzung erreichbar, weil der Shortcut vor jedem Gaststart steht. Die
 * Antwort enthält nur, was die Profilseite ohnehin öffentlich zeigt: Name,
 * Rolle, Bild und drei Skills. Scheitert die Abfrage, bleibt die Liste leer —
 * der Shortcut funktioniert auch ohne sie.
 */
export async function GET() {
  const showcase = await loadAutomationShowcase().catch((error: unknown) => {
    console.error("automation showcase unavailable", error);
    return EMPTY_AUTOMATION_SHOWCASE;
  });

  return NextResponse.json(showcase, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
