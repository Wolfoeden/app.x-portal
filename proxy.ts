import { NextResponse, type NextRequest } from "next/server";

import {
  buildContentSecurityPolicy,
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
} from "@/lib/security/csp";

/**
 * Erzeugt die Nonce für die Content-Security-Policy.
 *
 * Der Header muss auf die *Anfrage* gesetzt werden, nicht nur auf die Antwort:
 * Next liest `content-security-policy` beziehungsweise
 * `content-security-policy-report-only` aus den Anfrage-Headern, zieht die
 * Nonce heraus und schreibt sie an seine eigenen Skript-Tags. Ohne diesen
 * Schritt trägt die Richtlinie eine Nonce, die an keinem Skript steht.
 *
 * Die durchgesetzte Richtlinie kommt weiterhin aus `next.config.ts`. Hier
 * entsteht vorerst nur die Report-Only-Fassung — siehe `lib/security/csp.ts`
 * für den geplanten Rollentausch.
 *
 * In Next 16 heißt diese Datei `proxy.ts`; `middleware.ts` ist derselbe
 * Mechanismus unter dem alten Namen und wird beim Build als veraltet gemeldet.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export default function proxy(request: NextRequest) {
  // 14.10.2026: Das Profil-Panel im Talent Index ist weg. Links mit
  // `/chat?profil=<id>` (Mails, Lesezeichen, geteilte Links) führen direkt
  // auf die Profilseite; das Projekt (`projekt`) kommt mit.
  const linkedProfile = request.nextUrl.pathname === "/chat" ? request.nextUrl.searchParams.get("profil") : null;
  if (linkedProfile && UUID.test(linkedProfile)) {
    const target = request.nextUrl.clone();
    const project = request.nextUrl.searchParams.get("projekt");
    target.pathname = `/profil/${linkedProfile.toLowerCase()}`;
    target.search = "";
    target.searchParams.set("via", "share");
    if (project && UUID.test(project)) target.searchParams.set("projekt", project);
    return NextResponse.redirect(target, 307);
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const reportOnlyPolicy = buildContentSecurityPolicy({
    nonce,
    isProduction: process.env.NODE_ENV === "production",
    reportPath: CSP_REPORT_PATH,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy-report-only", reportOnlyPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    "content-security-policy-report-only",
    reportOnlyPolicy,
  );
  // `report-uri` ist abgekündigt, wird aber noch von mehr Browsern gelesen als
  // die Reporting-API. Beide Wege zeigen auf dieselbe Route.
  response.headers.set(
    "reporting-endpoints",
    `${CSP_REPORT_GROUP}="${new URL(CSP_REPORT_PATH, request.nextUrl.origin).toString()}"`,
  );
  return response;
}

export const config = {
  matcher: [
    {
      // Statische Dateien und die API brauchen keine Nonce. Prefetches werden
      // ausgenommen, damit eine Nonce nicht in einer vorgeladenen Antwort
      // landet und dort veraltet. Bilder, Videos und Symbole aus `public/`
      // ebenso: Sie liefen bisher bei jedem Abruf durch die Funktion.
      source: "/((?!api|_next/static|_next/image|favicon.ico|images/|videos/|icon.png|apple-icon.png|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
