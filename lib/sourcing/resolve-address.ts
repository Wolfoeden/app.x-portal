import "server-only";

import {
  assessAddress,
  extractEmails,
  findImprintUrl,
  IMPRINT_PATHS,
  usableAddresses,
  type AddressAssessment,
} from "./address";
import { fetchSite } from "./fetch-site";
import { htmlToText } from "./html-text";
import { searchPersonalSite, type SiteCandidate, type SiteSearchClient } from "./site-search";

/**
 * Der ganze Weg von einem Namen zu einer benutzbaren Adresse.
 *
 *   freelancermap  →  Name, Rolle, Skills
 *   Websuche       →  Adresse der eigenen Seite   (ein Aufruf, ~5 ct)
 *   eigener Abruf  →  Impressum
 *   eigene Prüfung →  gehört die Adresse der Person?
 *
 * Die drei letzten Schritte laufen ohne Modell. Das ist der Punkt: Die Suche
 * darf sich irren, ohne dass jemand Falsches Post bekommt — denn ob die
 * gefundene Adresse zu dieser Person gehört, entscheidet der Text des
 * Impressums und nicht die Meinung eines Modells.
 */

/** Wie viele Seitenvorschläge je Person geöffnet werden. */
const MAX_SEITEN = 2;

/** Wie viele Pfade probiert werden, wenn kein Impressumslink dasteht. */
const MAX_PFAD_VERSUCHE = 3;

export type ResolveFailure =
  /** Die Suche fand keine eigene Seite. */
  | "no_site_found"
  /** Der Anbieter war nicht erreichbar oder nicht eingerichtet. */
  | "provider_unavailable"
  /** Seiten gefunden, aber kein Impressum darauf. */
  | "no_imprint"
  /** Impressum gefunden, aber keine Adresse darin. */
  | "no_address"
  /** Adressen gefunden, aber keine, die benutzt werden darf. */
  | "no_usable_address";

export type ResolveOutcome =
  | {
      resolved: true;
      address: AddressAssessment;
      /** Die Seite, auf der die Adresse stand. */
      imprintUrl: string;
      /** Alles, was geprüft wurde — auch das Verworfene, mit Begründung. */
      considered: AddressAssessment[];
      sites: SiteCandidate[];
    }
  | {
      resolved: false;
      reason: ResolveFailure;
      considered: AddressAssessment[];
      sites: SiteCandidate[];
    };

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
async function holeImpressum(
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

/**
 * HTML zu Text, damit Namen und Rollen nebeneinander stehen.
 *
 * Die frühere Fassung ließ `<SCRIPT>` in Großbuchstaben stehen. Der Quelltext
 * eines Skripts landete damit in genau dem Text, in dem gleich nach
 * E-Mail-Adressen und nach dem Namen der Person gesucht wird — wer auf seiner
 * Seite eine fremde Adresse in ein Skript schreibt, hätte unsere Entscheidung
 * verschoben, welches Postfach wem gehört.
 */
function nurText(html: string): string {
  return htmlToText(html);
}

export async function resolveContactAddress(input: {
  displayName: string;
  role: string;
  skills?: readonly string[];
  location?: string | null;
  safetyIdentifier?: string;
  fetchImpl?: typeof fetch;
  searchClient?: SiteSearchClient;
}): Promise<ResolveOutcome> {
  const suche = await searchPersonalSite(
    {
      displayName: input.displayName,
      role: input.role,
      skills: input.skills,
      location: input.location ?? null,
      safetyIdentifier: input.safetyIdentifier,
    },
    { client: input.searchClient },
  );

  if (!suche.providerAvailable) {
    return { resolved: false, reason: "provider_unavailable", considered: [], sites: [] };
  }
  if (suche.sites.length === 0) {
    return { resolved: false, reason: "no_site_found", considered: [], sites: [] };
  }

  // Erst, was das Modell für die eigene Seite hält. Ein vermuteter Arbeitgeber
  // wird zuletzt geprüft — dort ist die Ausbeute nach Romans Regel ohnehin
  // meist `third_party_mailbox`.
  const rang: Record<SiteCandidate["kind"], number> = {
    own_site: 0,
    own_company: 1,
    unclear: 2,
    employer: 3,
  };
  const seiten = [...suche.sites]
    .sort((links, rechts) => rang[links.kind] - rang[rechts.kind])
    .slice(0, MAX_SEITEN);

  const geprueft: AddressAssessment[] = [];
  let sahImpressum = false;
  let sahAdresse = false;

  for (const seite of seiten) {
    const impressum = await holeImpressum(seite.url, input.fetchImpl);
    if (!impressum) continue;
    sahImpressum = true;

    const text = nurText(impressum.text);
    const adressen = extractEmails(text);
    if (adressen.length === 0) continue;
    sahAdresse = true;

    for (const adresse of adressen.slice(0, 8)) {
      geprueft.push(
        assessAddress({
          email: adresse,
          displayName: input.displayName,
          pageUrl: impressum.url,
          imprintText: text,
        }),
      );
    }

    const brauchbar = usableAddresses(geprueft);
    if (brauchbar.length > 0) {
      return {
        resolved: true,
        address: brauchbar[0]!,
        imprintUrl: impressum.url,
        considered: geprueft,
        sites: suche.sites,
      };
    }
  }

  return {
    resolved: false,
    reason: !sahImpressum ? "no_imprint" : !sahAdresse ? "no_address" : "no_usable_address",
    considered: geprueft,
    sites: suche.sites,
  };
}
