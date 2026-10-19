/**
 * Texte des Bewerber-Portals, ohne React: Der Einstieg (ApplicantLanding.tsx)
 * rendert auf dem Server, das Profil-Dashboard im Browser; beide lesen hier.
 */

/**
 * Der erste Bildschirm für abgemeldete Besucher und für Angemeldete ohne
 * Profil: zuerst der eigene Nutzen, dann der Prüfprozess (UX-Review Oktober
 * 2026). Beide Stellen lesen denselben Text.
 */
export const APPLY_HERO = {
  eyebrow: "Bewerber-Portal",
  title: "Profil veröffentlichen. Gefunden werden.",
  lead: "Nicht blind bewerben. Erst prüfen: XPORTAL gleicht Ihr Profil mit Projektanfragen ab und meldet sich, wenn es passt.",
} as const;

/**
 * Was vor der Registrierung feststehen sollte (Audit P2, Freelancer-Aufnahme):
 * Kosten, Kontakt, Ablauf, Prüfumfang und Unterlagen — in dieser Reihenfolge,
 * damit der Nutzen vor dem Prüfprozess steht. Die Angaben folgen dem
 * Formular: Lebenslauf und Kalenderlink sind optional (ApplyForm.tsx,
 * lib/freelancer/application.ts), geprüft wird jede Angabe einzeln
 * (docs/operator-runbook.md). Kontaktdaten stehen in keinem öffentlichen
 * Profil (ShowcaseProfile in lib/freelancer/showcase.ts, ProfileDossier).
 */
export function onboardingFacts(): ReadonlyArray<{ term: string; chip: string; text: string }> {
  return [
    {
      term: "Kosten",
      chip: "Kostenlos",
      text: "Keine. Registrierung, Profil und Kontaktanfragen sind für Sie kostenlos, eine Provision fällt für niemanden an.",
    },
    {
      term: "Kontakt",
      chip: "Kontaktdaten bleiben privat",
      text: "Unternehmen sehen Ihr freigegebenes Profil ohne E-Mail-Adresse und Telefonnummer. Passt eine Anfrage, meldet sich XPORTAL bei Ihnen und stellt Sie per E-Mail vor.",
    },
    {
      term: "Ablauf",
      chip: "So läuft es ab",
      text: "Konto anlegen und E-Mail bestätigen, Profil in vier Abschnitten ausfüllen, Prüfung durch XPORTAL mit Rückfragen per E-Mail. Nach der Freigabe ist Ihr Profil im Matching auffindbar.",
    },
    {
      term: "Prüfung",
      chip: "Geprüft vor Freigabe",
      text: "XPORTAL sichtet Ihre Angaben und gleicht einzelne mit Nachweisen ab, etwa Lebenslauf oder öffentlichem Berufsprofil. Nur diese erscheinen als „Von XPORTAL geprüft“; alles andere bleibt Ihre Angabe.",
    },
    {
      term: "Unterlagen",
      chip: "Lebenslauf hilft, ist kein Muss",
      text: "Rolle, Kompetenzen, Sprachen, Verfügbarkeit und Honorar. Ein Lebenslauf als PDF (bis 10 MB) hilft bei der Prüfung, ein Kalenderlink ist optional.",
    },
  ];
}

/**
 * Fragen, die vor allem Menschen ohne Freelance-Erfahrung stellen. Keine
 * Zusage zu Förderung oder Leistungen: nur der Hinweis, wen man fragt.
 */
export const APPLICANT_FAQ: ReadonlyArray<{ question: string; label: string; answer: string }> = [
  {
    question: "Muss ich schon selbstständig sein?",
    label: "Auch ohne Selbstständigkeit",
    answer:
      "Nein. Sie können ein Profil anlegen, bevor Sie eine selbstständige Tätigkeit anmelden. Wie Sie arbeiten, klären Sie vor dem ersten Auftrag.",
  },
  {
    question: "Ich suche eine feste Stelle. Bin ich hier richtig?",
    label: "Auch für feste Stellen",
    answer:
      "Ja. Wählen Sie im Formular „Eine feste Stelle“. Ihr Profil erscheint dann nicht in der öffentlichen Freelancer-Suche; es sieht nur das XPORTAL-Team.",
  },
  {
    question: "Ich beziehe Arbeitslosengeld oder Bürgergeld.",
    label: "Arbeitslosengeld oder Bürgergeld",
    answer:
      "Teilen Sie einen Auftrag oder eine neue Stelle wie gewohnt Ihrer Agentur für Arbeit oder Ihrem Jobcenter mit. Wenn Sie sich selbstständig machen möchten, fragen Sie dort nach Förderung, etwa dem Gründungszuschuss (bei Arbeitslosengeld) oder dem Einstiegsgeld (bei Bürgergeld).",
  },
  {
    question: "Ich habe Lücken im Lebenslauf.",
    label: "Lücken im Lebenslauf",
    answer:
      "Kein Problem. Wir schauen auf das, was Sie können. Ihr Lebenslauf ist die Grundlage für den Profilentwurf; Lücken dürfen darin sichtbar bleiben.",
  },
];
