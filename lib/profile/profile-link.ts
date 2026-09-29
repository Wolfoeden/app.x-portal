/**
 * Der Link auf ein einzelnes Freelancer-Profil.
 *
 * Er zeigt die Profilkarte ohne den Chat, in dem das Profil gefunden wurde:
 * für Mails, zum Weiterleiten an Kollegen, zum Merken. `via` sagt, woher der
 * Aufruf kam; damit lässt sich zählen, ob Links aus Mails geöffnet werden.
 */

export const PROFILE_PATH_PREFIX = "/profil";

export const PROFILE_LINK_SOURCES = ["lead", "intro", "share", "chat"] as const;
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
 * Anmeldung. Mit dem Modell läuft jede Anfrage über ein Projekt, weil nur so
 * klar ist, wofür vorgestellt wird. Kommt der Aufruf aus einem Projekt, wird
 * dort angefragt; sonst beginnt der Weg mit der Projektbeschreibung.
 */
export function profilePageAction(input: {
  profileId: string;
  placement: boolean;
  hasCalendar: boolean;
  isAccountUser: boolean;
  projectId: string | null;
  via: ProfileLinkSource | null;
}): ProfilePageAction {
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
      hint: "Kostenlos bis zur Beauftragung · XPORTAL stellt Sie vor",
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
      hint: "Kostenlos bis zur Beauftragung · E-Mail bestätigen, kein Passwort nötig",
    };
  }
  return {
    kind: "link",
    href: "/chat",
    label: "Projekt beschreiben und anfragen",
    hint: "Kostenlos bis zur Beauftragung · Die Anfrage läuft über Ihr Projekt",
  };
}
