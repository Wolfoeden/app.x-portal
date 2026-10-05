/**
 * Fallbeispiele für die Startseite: echte Ausschreibungen, echte Profile,
 * der Abgleich so, wie XPORTAL ihn gemacht hat (UX-Review Oktober 2026:
 * „echte, freigegebene Fallbeispiele“).
 *
 * Was hier steht, ist nachprüfbar:
 * - Die Ausschreibungen waren öffentlich (Freelancer-Portal, September 2026)
 *   und kamen von Personaldienstleistern. Anforderungen stehen so in der
 *   Ausschreibung; Firmen, Kennungen und Ansprechpartner sind weggelassen.
 * - Profil, Belege und offene Punkte stammen aus `freelancer_profiles` und
 *   dem Anschreiben in `leadgen_outreach`, mit dem XPORTAL das Profil
 *   vorgeschlagen hat. „Geprüft“ steht nur bei `operator_verified`.
 * - Ein Abgleich ist keine Vermittlung. Ob es zu einer Beauftragung kam, ist
 *   nicht dokumentiert, und so steht es auch da.
 *
 * Sichtbar wird ein Fall erst mit `approved: true`. Das setzt der Betreiber,
 * nachdem er Wortlaut und Anonymisierung geprüft hat.
 */

export type CaseStudy = {
  id: string;
  /** Erst nach Freigabe durch den Betreiber auf der Seite. */
  approved: boolean;
  month: string;
  source: string;
  title: string;
  conditions: string;
  /** Muss-Anforderungen aus der Ausschreibung, gekürzt, nicht umgedeutet. */
  required: readonly string[];
  profile: { role: string; check: string };
  /** Was das vorgeschlagene Profil zu den Anforderungen belegt. */
  evidence: readonly string[];
  /** Was offen blieb und vor einer Vorstellung zu klären war. */
  open: readonly string[];
  /** Was XPORTAL getan hat. */
  action: string;
  /** Wie es ausging — nur, was dokumentiert ist. */
  outcome: string;
};

export const CASE_STUDIES: readonly CaseStudy[] = [
  {
    id: "ki-backend-python-kubernetes",
    approved: false,
    month: "September 2026",
    source: "Ausschreibung einer IT-Personalvermittlung",
    title: "Backend-Entwicklung für KI-Dienste mit Python, Docker und Kubernetes",
    conditions: "100 % remote · ab sofort · 4 Monate, Verlängerung möglich",
    required: [
      "Python",
      "Docker und Kubernetes",
      "KI-Dienste und -Modelle in Anwendungen integrieren",
      "REST-APIs, Queues, API-Sicherheit",
      "Englisch",
    ],
    profile: { role: "Cloud- & Platform Engineer", check: "Profil von XPORTAL geprüft" },
    evidence: ["Python", "Docker", "Kubernetes", "LLM- und OpenAI-Integration", "Azure (in der Ausschreibung optional)"],
    open: [
      "REST-APIs, Queues und API-Sicherheit sind im Profil nicht einzeln belegt",
      "Englisch ist im Profil nicht angegeben",
      "Kein Stunden- oder Tagessatz im Profil",
    ],
    action: "XPORTAL hat das Profil dem Personaldienstleister per E-Mail vorgeschlagen, mit Belegen und offenen Punkten.",
    outcome: "Ausgang offen: Eine Rückmeldung oder Beauftragung ist nicht dokumentiert.",
  },
  {
    id: "scrum-master-safe",
    approved: false,
    month: "September 2026",
    source: "Ausschreibung eines Personaldienstleisters",
    title: "Scrum Master mit SAFe, Scrum und Kanban",
    conditions: "75 % remote, Raum Frankfurt · Mitte September bis Jahresende",
    required: [
      "Scrum, Kanban und SAFe, mehr als 5 Jahre",
      "SAFe-Zertifizierung (Scrum Master oder Team Coach)",
      "Workshop-Moderation",
      "Agile Kennzahlen",
      "Erfahrung mit Softwareentwicklung und IT-Betrieb",
    ],
    profile: { role: "Leitung Business-Agility-Transformation", check: "Angaben des Freelancers, noch nicht von XPORTAL geprüft" },
    evidence: ["Scrum", "Kanban", "SAFe", "Workshops", "Change Management (in der Ausschreibung optional)", "Deutsch und Englisch"],
    open: [
      "Eine SAFe-Zertifizierung ist im Profil nicht angegeben",
      "Jahre und Referenzen sind nicht einzeln belegt",
      "Kein Stunden- oder Tagessatz im Profil",
    ],
    action: "XPORTAL hat das Profil dem Personaldienstleister per E-Mail vorgeschlagen, mit Belegen und offenen Punkten.",
    outcome: "Ausgang offen: Eine Rückmeldung oder Beauftragung ist nicht dokumentiert.",
  },
  {
    id: "data-scientist-python-react",
    approved: false,
    month: "September 2026",
    source: "Ausschreibung eines Personaldienstleisters",
    title: "Data Scientist mit Python, Directus und React",
    conditions: "95 % remote, Raum Frankfurt · bis Jahresende",
    required: [
      "Studium mit KI-Schwerpunkt",
      "Mehr als 3 Jahre Webentwicklung mit Datenanwendungen",
      "Directus oder vergleichbares Backend as a Service",
      "Python in ML-Projekten",
    ],
    profile: { role: "KI-Spezialist", check: "Identität geprüft, Kompetenzen nach Angabe des Freelancers" },
    evidence: ["Python", "Machine Learning", "React (in der Ausschreibung optional)", "TypeScript und Next.js", "Stundensatz angegeben"],
    open: [
      "Directus oder ein vergleichbares System ist im Profil nicht angegeben — eine Muss-Anforderung",
      "Das Studium ist im Profil nicht angegeben",
      "Das Profil nennt nur Englisch",
    ],
    action: "XPORTAL hat das Profil mit zwei weiteren dem Personaldienstleister per E-Mail vorgeschlagen, mit Belegen und offenen Punkten.",
    outcome: "Ausgang offen: Eine Rückmeldung oder Beauftragung ist nicht dokumentiert.",
  },
];

/** Nur, was der Betreiber freigegeben hat. */
export function publishedCaseStudies(cases: readonly CaseStudy[] = CASE_STUDIES): readonly CaseStudy[] {
  return cases.filter((entry) => entry.approved);
}
