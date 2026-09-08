/**
 * Fremde Seiten holen, ohne sich dabei ins eigene Netz schießen zu lassen.
 *
 * Die Adressen, die hier ankommen, stammen aus einer Websuche — also aus einer
 * Modellantwort, also von außen. Eine solche Adresse blind mit `fetch()` zu
 * öffnen, hieße einem Fremden zu erlauben, unseren Server auf ein Ziel seiner
 * Wahl zeigen zu lassen: auf `localhost`, auf die Metadaten-Schnittstelle der
 * Cloud, auf ein internes Netz. Deshalb steht vor jedem Abruf eine Prüfung,
 * und sie gilt auch für jede Weiterleitung.
 */

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** Namen, die auf den eigenen Rechner oder ein internes Netz zeigen. */
const GESPERRTE_NAMEN = [
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.goog",
];

const GESPERRTE_ENDUNGEN = [".local", ".internal", ".localhost", ".home.arpa"];

/**
 * Eine IP-Adresse als Hostname ist immer verdächtig: Eine echte Firmenseite
 * wird über ihren Namen aufgerufen. Wer eine IP einsetzt, umgeht die
 * Namensprüfung — deshalb sind sie sämtlich gesperrt, nicht nur die privaten
 * Bereiche.
 */
function istIpLiteral(hostname: string): boolean {
  if (hostname.startsWith("[")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/u.test(hostname) || /^\d+$/u.test(hostname);
}

export type UrlRejection =
  | "not_https"
  | "has_credentials"
  | "ip_literal"
  | "internal_name"
  | "unparsable";

/** Darf diese Adresse abgerufen werden? Null heißt ja. */
export function rejectUrl(raw: string): UrlRejection | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "unparsable";
  }
  if (url.protocol !== "https:") return "not_https";
  if (url.username || url.password) return "has_credentials";

  const host = url.hostname.toLowerCase();
  if (istIpLiteral(host)) return "ip_literal";
  if (GESPERRTE_NAMEN.includes(host)) return "internal_name";
  if (GESPERRTE_ENDUNGEN.some((endung) => host.endsWith(endung))) {
    return "internal_name";
  }
  // Ein Name ohne Punkt ist kein öffentlicher Name, sondern ein Rechner im
  // eigenen Netz.
  if (!host.includes(".")) return "internal_name";
  return null;
}

export type SiteFetch =
  | { ok: true; url: string; html: string; truncated: boolean }
  | { ok: false; reason: UrlRejection | "http_error" | "timeout" | "network" | "not_html"; detail: string };

/**
 * Holt eine Seite als Text.
 *
 * Weiterleitungen werden von Hand verfolgt, damit jedes Ziel dieselbe Prüfung
 * durchläuft — `redirect: "follow"` würde die erste Prüfung wertlos machen,
 * weil eine harmlose Adresse auf eine interne weiterleiten kann.
 */
export async function fetchSite(
  raw: string,
  options: { fetchImpl?: typeof fetch; maxBytes?: number } = {},
): Promise<SiteFetch> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_BYTES;

  let ziel = raw;
  for (let sprung = 0; sprung <= MAX_REDIRECTS; sprung += 1) {
    const ablehnung = rejectUrl(ziel);
    if (ablehnung) return { ok: false, reason: ablehnung, detail: ziel };

    const abbruch = new AbortController();
    const uhr = setTimeout(() => abbruch.abort(), TIMEOUT_MS);
    let antwort: Response;
    try {
      antwort = await fetchImpl(ziel, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.8" },
        redirect: "manual",
        signal: abbruch.signal,
      });
    } catch (fehler) {
      clearTimeout(uhr);
      const abgebrochen =
        fehler instanceof Error &&
        (fehler.name === "AbortError" || fehler.name === "TimeoutError");
      return {
        ok: false,
        reason: abgebrochen ? "timeout" : "network",
        detail: fehler instanceof Error ? fehler.message : "unbekannt",
      };
    }
    clearTimeout(uhr);

    if (antwort.status >= 300 && antwort.status < 400) {
      const weiter = antwort.headers.get("location");
      if (!weiter) {
        return { ok: false, reason: "http_error", detail: `${antwort.status} ohne Ziel` };
      }
      try {
        ziel = new URL(weiter, ziel).toString();
      } catch {
        return { ok: false, reason: "unparsable", detail: weiter };
      }
      continue;
    }

    if (!antwort.ok) {
      return { ok: false, reason: "http_error", detail: String(antwort.status) };
    }

    const typ = antwort.headers.get("content-type") ?? "";
    if (typ && !/text\/html|application\/xhtml|text\/plain/u.test(typ)) {
      return { ok: false, reason: "not_html", detail: typ };
    }

    const text = await antwort.text();
    return {
      ok: true,
      url: ziel,
      html: text.slice(0, maxBytes),
      truncated: text.length > maxBytes,
    };
  }

  return { ok: false, reason: "http_error", detail: "zu viele Weiterleitungen" };
}
