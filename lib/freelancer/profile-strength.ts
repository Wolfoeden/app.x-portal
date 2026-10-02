/**
 * Wie vollständig ein Profil ist — für den Freelancer als „Nächster
 * Schritt“, für den Betreiber als Sortierung der Pflegeliste.
 *
 * Gezählt wird, was Kunden auf Karte und Profil helfen würde: Foto,
 * Projekte, ein Kurzprofil mit Substanz, Honorar, eine frische
 * Verfügbarkeit. Die Zahl („6 von 8“) ist keine Bewertung der Person und
 * keine Prozentangabe.
 */

export type StrengthInput = {
  hasPhoto: boolean;
  summaryLength: number;
  projects: ReadonlyArray<{ hasOutcome: boolean }>;
  hasRate: boolean;
  seeking: "projects" | "employment" | "both";
  availabilityUpdatedAt: string | null;
  skillsCount: number;
  industriesCount: number;
  now: Date;
};

export type StrengthStep = { key: string; label: string; done: boolean; hint: string };

export type ProfileStrength = {
  done: number;
  total: number;
  level: "Basis" | "Gut" | "Stark";
  steps: StrengthStep[];
  next: StrengthStep | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const STRENGTH_SUMMARY_MIN = 200;
export const STRENGTH_SKILLS_MIN = 5;
export const STRENGTH_AVAILABILITY_DAYS = 30;

export function profileStrength(input: StrengthInput): ProfileStrength {
  const updated = input.availabilityUpdatedAt ? new Date(input.availabilityUpdatedAt).getTime() : Number.NaN;
  const freshAvailability = !Number.isNaN(updated) && input.now.getTime() - updated <= STRENGTH_AVAILABILITY_DAYS * DAY_MS;
  const withOutcome = input.projects.filter((project) => project.hasOutcome).length;

  // In der Reihenfolge, in der sie Kunden am meisten helfen: Der erste offene
  // Punkt ist der nächste Schritt.
  const steps: StrengthStep[] = [
    { key: "project", label: "Ein Referenzprojekt", done: input.projects.length >= 1, hint: "Ein Projekt mit Titel, Branche und Technologien zeigt, was Sie gemacht haben." },
    { key: "photo", label: "Foto", done: input.hasPhoto, hint: "Ein Foto macht die Karte persönlich und wird häufiger angeklickt." },
    {
      key: "summary",
      label: `Kurzprofil mit mindestens ${STRENGTH_SUMMARY_MIN} Zeichen`,
      done: input.summaryLength >= STRENGTH_SUMMARY_MIN,
      hint: "Zwei, drei Sätze: was Sie machen, für wen, woran zuletzt.",
    },
    ...(input.seeking === "employment"
      ? []
      : [{ key: "rate", label: "Honorar", done: input.hasRate, hint: "Ohne Honorar steht auf der Karte „Vorher klären: Honorar nicht angegeben“." }]),
    {
      key: "availability",
      label: "Verfügbarkeit aktuell",
      done: freshAvailability,
      hint: `Bestätigen Sie Ihre Verfügbarkeit mindestens alle ${STRENGTH_AVAILABILITY_DAYS} Tage.`,
    },
    {
      key: "outcomes",
      label: "Zwei Projekte mit Ergebnis",
      done: withOutcome >= 2,
      hint: "Ein Satz Ergebnis je Projekt („Durchlaufzeit halbiert“) überzeugt mehr als eine Liste.",
    },
    {
      key: "skills",
      label: `Mindestens ${STRENGTH_SKILLS_MIN} Kompetenzen`,
      done: input.skillsCount >= STRENGTH_SKILLS_MIN,
      hint: "Konkrete Werkzeuge statt Schlagworte: Danach sucht der Abgleich.",
    },
    { key: "industry", label: "Branche", done: input.industriesCount >= 1, hint: "In welcher Branche Sie gearbeitet haben, hilft beim Einordnen." },
  ];

  const done = steps.filter((step) => step.done).length;
  const total = steps.length;
  return {
    done,
    total,
    level: done >= total - 1 ? "Stark" : done >= Math.ceil(total / 2) ? "Gut" : "Basis",
    steps,
    next: steps.find((step) => !step.done) ?? null,
  };
}
