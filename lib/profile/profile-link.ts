/**
 * Der Link auf ein einzelnes Freelancer-Profil.
 *
 * Er zeigt die Profilkarte ohne den Chat, in dem das Profil gefunden wurde:
 * für Mails, zum Weiterleiten an Kollegen, zum Merken. `via` sagt, woher der
 * Aufruf kam; damit lässt sich zählen, ob Links aus Mails geöffnet werden.
 */

export const PROFILE_PATH_PREFIX = "/profil";

/** `shortcut`: aus der Liste selbst angemeldeter Profile unter einem Chat-Shortcut. */
export const PROFILE_LINK_SOURCES = ["lead", "intro", "share", "chat", "shortcut"] as const;
export type ProfileLinkSource = (typeof PROFILE_LINK_SOURCES)[number];

export function isProfileLinkSource(value: unknown): value is ProfileLinkSource {
  return typeof value === "string" && (PROFILE_LINK_SOURCES as readonly string[]).includes(value);
}

export function profilePath(profileId: string, via?: ProfileLinkSource): string {
  const path = `${PROFILE_PATH_PREFIX}/${encodeURIComponent(profileId)}`;
  return via ? `${path}?via=${via}` : path;
}

export function profileUrl(siteUrl: string, profileId: string, via?: ProfileLinkSource): string {
  return `${siteUrl.replace(/\/+$/u, "")}${profilePath(profileId, via)}`;
}

export type ProfilePageAction =
  | { kind: "booking"; href: string; label: string; hint: string }
  | { kind: "request"; projectId: string; label: string; hint: string }
  | { kind: "link"; href: string; label: string; hint: string }
  | { kind: "none"; label: string; hint: string };

/**
 * Der Knopf auf der Profilseite.
 *
 * Ohne Vermittlungsmodell wie in der Lead-Mail: direkt zum Kalender, ohne
 * Anmeldung. Mit dem Modell:
 * - Kunden mit bezahltem Tarif (`directBooking`) buchen direkt, wenn das
 *   Profil einen Kalender hat.
 * - Kommt der Aufruf aus einem Projekt, wird dort angefragt.
 * - Sonst geht es zu „Gespräch buchen“ mit diesem Profil vorausgewählt:
 *   XPORTAL klärt im Gespräch, was gebraucht wird, und stellt vor. Bisher
 *   führte der Knopf hier in einen leeren Chat.
 */
export function profilePageAction(input: {
  profileId: string;
  placement: boolean;
  hasCalendar: boolean;
  isAccountUser: boolean;
  projectId: string | null;
  via: ProfileLinkSource | null;
  directBooking?: boolean;
}): ProfilePageAction {
  if (input.placement && input.directBooking && input.isAccountUser && input.hasCalendar) {
    return {
      kind: "booking",
      href: `/api/freelancers/${input.profileId}/book`,
      label: "Termin buchen",
      hint: "In Ihrem Tarif enthalten · Sie wählen den Termin im Kalender des Freelancers",
    };
  }
  if (!input.placement) {
    if (!input.hasCalendar) {
      return {
        kind: "none",
        label: "Aktuell nicht buchbar",
        hint: "Für dieses Profil ist gerade kein Kalender freigegeben.",
      };
    }
    return {
      kind: "booking",
      href: `/api/freelancers/${input.profileId}/book${input.via === "lead" ? "?via=lead" : ""}`,
      label: "Erstgespräch vereinbaren",
      hint: "Kostenloses Erstgespräch · Sie wählen den Termin selbst",
    };
  }

  if (input.projectId && input.isAccountUser) {
    return {
      kind: "request",
      projectId: input.projectId,
      label: "Freelancer anfragen",
      hint: "Kontakt mit Zustimmung des Freelancers · keine Vermittlungsprovision",
    };
  }
  if (input.projectId) {
    const params = new URLSearchParams({
      resume: "book_profile",
      project: input.projectId,
      profile: input.profileId,
    });
    return {
      kind: "link",
      href: `/chat?${params.toString()}`,
      label: "Freelancer anfragen",
      hint: "E-Mail bestätigen und Trial oder Tarif aktivieren · Kontakt nur mit Freigabe",
    };
  }
  return {
    kind: "link",
    href: `/chat?profil=${encodeURIComponent(input.profileId)}`,
    label: "Im Arbeitsbereich öffnen",
    hint: "Anforderungen hinterlegen, Profil prüfen und Kontakt selbstständig anfragen",
  };
}
