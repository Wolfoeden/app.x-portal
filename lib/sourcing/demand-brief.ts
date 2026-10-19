/**
 * Was ein Auftraggeber gesucht hat, so konkret wie es belegt ist.
 *
 * `absorb-search.ts` legt den Bedarf aus einer bezahlten Kundensuche am
 * Kandidaten ab (`freelancer_applications.sourcing_demand`); die
 * Nachfrageseite zeigt daraus das Thema. Bis 19.10.2026 stand der Typ beim
 * Einladungstext in `lib/freelancer/outreach.ts`, der nie verschickt wurde.
 */
export type DemandBrief = {
  /** Das Thema in wenigen Worten, etwa „Datenmigration nach PostgreSQL". */
  headline: string;
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  /** Ort, wenn er für die Arbeitsform eine Rolle spielt. */
  location?: string | null;
  /** Gefragte Erfahrungen, die auch auf dem Profil der Person stehen. */
  matchingSkills?: readonly string[];
  /** Weitere gefragte Erfahrungen, ohne Überschneidung. */
  otherSkills?: readonly string[];
  /** Wie oft nach diesem Profil gesucht wurde. */
  searches?: number;
  /** Eindeutige Nachfrager. Gezählt werden Suchende, nicht Suchen. */
  uniqueSeekers?: number;
};
