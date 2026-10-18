import type { Config, Context } from "@netlify/functions";

/**
 * Hält die Server-Funktion von Next warm. Alles, was nicht aus dem CDN kommt
 * (Talent Index, Anmeldung, Bewerber-Portal, API), läuft auf Netlify in einer
 * einzigen Funktion; nach einigen Minuten ohne Aufruf startete sie kalt, und
 * der nächste Besucher wartete mehrere Sekunden (Oktober 2026: p75 5,9 s auf
 * /chat, 7,5 s auf /anmelden).
 *
 * Ruft alle 5 Minuten die flache Prüfung `/api/health` auf: ohne Token, ohne
 * Datenbank, nicht cachebar (`/api/*` ist `no-store`). Läuft nur auf dem
 * veröffentlichten Produktions-Deploy, nicht in Vorschauen.
 */
export default async function keepWarm(_request: Request, context: Context): Promise<Response> {
  const response = await fetch(new URL("/api/health", context.site?.url ?? "https://x-portal.eu"), {
    headers: { "user-agent": "xportal-keep-warm" },
  }).catch(() => null);
  return new Response(null, { status: response?.ok ? 204 : 502 });
}

export const config: Config = {
  schedule: "*/5 * * * *",
};
