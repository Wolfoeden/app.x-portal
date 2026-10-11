import type { ApplicationStatus } from "./limits";

/**
 * Wo ein Konto auf der Freelancer-Seite steht. Schmal genug für jede
 * Sitzungsauskunft: Kennung und Sichtbarkeit des Profils oder der Stand der
 * Bewerbung, keine Profildaten.
 */
export type FreelancerPresence =
  | { kind: "none" }
  | { kind: "application"; status: ApplicationStatus }
  | { kind: "profile"; profileId: string; visible: boolean };

export const NO_FREELANCER_PRESENCE: FreelancerPresence = { kind: "none" };

const APPLICATION_STATES = new Set(["submitted", "in_review", "approved", "rejected"]);

/** Liest die Angabe aus einer Sitzungsantwort; alles Unbekannte ist „none“. */
export function parseFreelancerPresence(value: unknown): FreelancerPresence {
  if (!value || typeof value !== "object") return NO_FREELANCER_PRESENCE;
  const record = value as Record<string, unknown>;
  if (record.kind === "profile" && typeof record.profileId === "string" && record.profileId) {
    return { kind: "profile", profileId: record.profileId, visible: record.visible === true };
  }
  if (record.kind === "application" && typeof record.status === "string" && APPLICATION_STATES.has(record.status)) {
    return { kind: "application", status: record.status as ApplicationStatus };
  }
  return NO_FREELANCER_PRESENCE;
}

export const APPLICANT_PORTAL_PATH = "/bewerber-portal/apply";

/** Sofort ausführbare Schritte; alles andere ist ein Link. */
export type FreelancerProfileCommand = "publish" | "pause" | "push";

export type FreelancerAction =
  | { key: "apply" | "application" | "edit" | "view"; label: string; hint: string; href: string; external?: boolean }
  | { key: FreelancerProfileCommand; label: string; hint: string; command: FreelancerProfileCommand };

/**
 * Was ein Konto auf der Freelancer-Seite als Nächstes tun kann, wichtigster
 * Schritt zuerst. „Als Freelancer bewerben“ steht nur da, solange es weder
 * Bewerbung noch Profil gibt; danach geht es um das eigene Profil.
 */
export function freelancerActions(presence: FreelancerPresence): FreelancerAction[] {
  if (presence.kind === "none") {
    return [{ key: "apply", label: "Als Freelancer bewerben", hint: "Profil veröffentlichen. Gefunden werden.", href: APPLICANT_PORTAL_PATH }];
  }
  if (presence.kind === "application") {
    return [
      presence.status === "rejected"
        ? { key: "application", label: "Bewerbung überarbeiten", hint: "Angaben ergänzen und erneut einreichen", href: APPLICANT_PORTAL_PATH }
        : { key: "application", label: "Bewerbung ansehen", hint: "XPORTAL prüft Ihr Profil", href: APPLICANT_PORTAL_PATH },
    ];
  }
  const edit: FreelancerAction = { key: "edit", label: "Profil bearbeiten", hint: "Angaben, Skills und Projekte", href: `${APPLICANT_PORTAL_PATH}#profil-bearbeiten` };
  if (!presence.visible) {
    return [
      { key: "publish", label: "Profil veröffentlichen", hint: "Wieder für Unternehmen sichtbar", command: "publish" },
      edit,
    ];
  }
  return [
    { key: "view", label: "Profil ansehen", hint: "So sehen Unternehmen Ihr Profil", href: `/profil/${presence.profileId}?via=share`, external: true },
    edit,
    { key: "push", label: "Profil pushen", hint: "Verfügbarkeit bestätigen: Aktuelle Profile zeigt XPORTAL zuerst", command: "push" },
  ];
}

/** Was nach einem Schritt im Hinweis steht. */
export const FREELANCER_COMMAND_DONE: Readonly<Record<FreelancerProfileCommand, string>> = {
  publish: "Ihr Profil ist veröffentlicht und für Unternehmen sichtbar.",
  pause: "Ihr Profil ist pausiert. Unternehmen sehen es nicht mehr.",
  push: "Verfügbarkeit bestätigt. Profile mit aktueller Verfügbarkeit zeigt XPORTAL zuerst.",
};
