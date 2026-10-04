import { NextResponse, type NextRequest } from "next/server";

import { emptyShowcase, isShowcaseTheme } from "@/lib/freelancer/showcase";
import { loadShowcase } from "@/lib/freelancer/showcase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Selbst angemeldete Freelancer für einen Rollen-Shortcut im Chat,
 * `?theme=ai-agents`.
 *
 * Ohne Sitzung erreichbar, weil der Shortcut vor jedem Gaststart steht. Die
 * Antwort enthält nur, was die Profilseite ohnehin öffentlich zeigt: Name,
 * Rolle, Bild, Kompetenzen, Honorar, Verfügbarkeit mit Stand und ob ein
 * Kalender hinterlegt ist — nicht seine Adresse. Scheitert die Abfrage, bleibt
 * die Liste leer; der Shortcut funktioniert auch ohne sie.
 */
export async function GET(request: NextRequest) {
  const theme = request.nextUrl.searchParams.get("theme");
  if (!isShowcaseTheme(theme)) {
    return NextResponse.json({ error: "Unbekannte Rolle." }, { status: 404 });
  }

  const showcase = await loadShowcase(theme).catch((error: unknown) => {
    console.error("role showcase unavailable", theme, error);
    return emptyShowcase(theme);
  });

  return NextResponse.json(showcase, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
