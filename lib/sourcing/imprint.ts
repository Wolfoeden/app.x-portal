import "server-only";

import { findImprintUrl, IMPRINT_PATHS } from "./address";
import { fetchSite } from "./fetch-site";

/**
 * Das Impressum einer Seite holen.
 *
 * Eigenes Modul, weil beide Wege zur Adresse es brauchen — der kostenlose
 * über abgeleitete Domains und der bezahlte über die Websuche. Zweimal
 * dieselbe Kaskade zu pflegen hiesse, sie auseinanderlaufen zu lassen.
 */

/** Wie viele Pfade probiert werden, wenn kein Impressumslink dasteht. */
const MAX_PFAD_VERSUCHE = 3;
/** Trägt schon der Pfad, dass hier die Pflichtangaben stehen? */
function istImpressumsPfad(url: string): boolean {
  try {
    return /impressum|imprint|legal|datenschutz|privacy|kontakt|contact/u.test(
      new URL(url).pathname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

/**
 * Merkmale, die eine Seite als Impressum ausweisen — nicht bloß als Seite mit
 * einem Link darauf.
 *
 * Die Unterscheidung ist nötig, weil jede Startseite das Wort „Impressum" im
 * Fußlink trägt. Diese Fassung verlangt entweder eine Formulierung, die nur
 * im Impressum selbst vorkommt, oder das Wort als Überschrift.
 */
const IMPRESSUM_MARKER =
  /angaben gemäß|angaben gemaess|verantwortlich für den inhalt|verantwortlich fuer den inhalt|<h[1-3][^>]*>\s*(impressum|imprint)\b/iu;

/** Ein schwächeres Merkmal, das nur nach dem Link-Umweg noch zählt. */
const IMPRESSUM_MARKER_SCHWACH = /impressum|imprint|datenschutzerkl/iu;

/** Das Impressum einer Seite: erst dem Link folgen, dann die üblichen Pfade. */
export async function fetchImprint(
  siteUrl: string,
  fetchImpl?: typeof fetch,
): Promise<{ url: string; text: string } | null> {
  const start = await fetchSite(siteUrl, { fetchImpl });

  // Die Suche liefert oft gleich die richtige Unterseite — sie hat ja dort
  // gelesen, dass die Person dahintersteht. Dann ist jede weitere Suche nach
  // einem Link verschenkt, und schlimmer: Sie führt an der Seite vorbei, auf
  // der die Adresse steht. Erst diese Prüfung, dann alles andere.
  if (start.ok && (istImpressumsPfad(start.url) || IMPRESSUM_MARKER.test(start.html))) {
    return { url: start.url, text: start.html };
  }

  if (start.ok) {
    const link = findImprintUrl(start.html, start.url);
    if (link) {
      const seite = await fetchSite(link, { fetchImpl });
      if (seite.ok) return { url: seite.url, text: seite.html };
    }
  }

  // Kein Link gefunden oder er führte ins Leere: die üblichen Pfade probieren.
  // Nur eine Handvoll — wer sein Impressum woanders versteckt, wird von Hand
  // bearbeitet.
  let basis: URL;
  try {
    basis = new URL(start.ok ? start.url : siteUrl);
  } catch {
    return null;
  }

  let versuche = 0;
  for (const pfad of IMPRINT_PATHS) {
    if (versuche >= MAX_PFAD_VERSUCHE) break;
    versuche += 1;
    const seite = await fetchSite(new URL(pfad, basis.origin).toString(), {
      fetchImpl,
    });
    if (seite.ok && IMPRESSUM_MARKER_SCHWACH.test(seite.html)) {
      return { url: seite.url, text: seite.html };
    }
  }

  return null;
}
