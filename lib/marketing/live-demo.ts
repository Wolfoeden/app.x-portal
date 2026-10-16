/**
 * Die Live-Demo der Startseite (Entwurf 3, 16.10.2026): drei Anfragen, wie
 * sie Unternehmen nach dem Telefonat stellen, und was der Talent Index
 * daraus macht. Die Profile sind echte, freigegebene Profile aus dem Talent
 * Index (Stand 16.10.2026): Rolle, Ort, Tagessatz, Verfügbarkeit und
 * Prüfstand wie im Profil. Namen gekürzt, Bilder gezeichnet
 * (public/images/demo, DiceBear „Notionists“, CC0) — es sind keine Fotos
 * der Personen.
 *
 * Ohne Server- und Datenbankabhängigkeit: Die Seite rendert in Tests, und
 * die Demo hängt nicht davon ab, dass die Datenbank antwortet.
 */

/** ok: passt; info: Angabe aus dem Profil; open: im Gespräch klären. */
export type DemoHit = { label: string; state: "ok" | "info" | "open" };

export type DemoPerson = {
  /** Vorname und Initial des Nachnamens. */
  name: string;
  avatar: string;
  role: string;
  where: string;
  rate: string;
  availability: string;
  available: boolean;
  /** Identität oder Angaben von XPORTAL geprüft. */
  verified: boolean;
  hits: readonly DemoHit[];
  why: string;
};

export type DemoScenario = {
  key: "agent" | "iso" | "schulung";
  tab: string;
  request: string;
  must: readonly string[];
  nice: readonly string[];
  facts: readonly (readonly [string, string])[];
  people: readonly DemoPerson[];
};

const avatar = (name: string) => `/images/demo/${name}.svg`;

const PATRICK: DemoPerson = {
  name: "Patrick H.",
  avatar: avatar("patrick"),
  role: "KI-Entwickler: Agenten und RAG",
  where: "Augsburg · remote",
  rate: "640 € / Tag",
  availability: "verfügbar",
  available: true,
  verified: true,
  hits: [
    { label: "KI-Agenten", state: "ok" },
    { label: "LLM-Integration", state: "ok" },
    { label: "RAG", state: "ok" },
    { label: "DSGVO: im Gespräch klären", state: "open" },
  ],
  why: "Baut Agenten mit RAG in TypeScript, deutlich unter Budget.",
};

const TOMAS: DemoPerson = {
  name: "Tomas S.",
  avatar: avatar("tomas"),
  role: "KI / Full Stack / Cloud",
  where: "Deutschland · remote",
  rate: "800 € / Tag",
  availability: "verfügbar",
  available: true,
  verified: true,
  hits: [
    { label: "KI-Agenten", state: "ok" },
    { label: "LLM-Integration", state: "ok" },
    { label: "RAG", state: "ok" },
    { label: "DSGVO", state: "ok" },
  ],
  why: "Agenten, RAG und DSGVO in einem Profil, genau im Budget.",
};

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    key: "agent",
    tab: "KI-Agent bauen",
    request:
      "Wir möchten einen KI-Agenten, der Kundenanfragen vorsortiert und Standardfragen beantwortet. Remote, Start im Januar, bis 800 € am Tag.",
    must: ["KI-Agenten", "LLM-Integration"],
    nice: ["RAG", "DSGVO"],
    facts: [
      ["Arbeitsort", "remote"],
      ["Start", "Januar 2027"],
      ["Budget", "bis 800 € / Tag"],
    ],
    people: [
      PATRICK,
      TOMAS,
      {
        name: "Vincent Z.",
        avatar: avatar("vincent"),
        role: "AI Engineer",
        where: "Braunschweig · remote",
        rate: "760 € / Tag",
        availability: "verfügbar",
        available: true,
        verified: true,
        hits: [
          { label: "KI-Agenten", state: "ok" },
          { label: "LLM-Integration", state: "ok" },
          { label: "LangChain", state: "info" },
          { label: "RAG: im Gespräch klären", state: "open" },
        ],
        why: "Agenten mit LangChain und Claude, im Budget.",
      },
    ],
  },
  {
    key: "iso",
    tab: "ISO 27001 einführen",
    request:
      "Ein Großkunde verlangt ISO 27001. Wer begleitet uns von der Einführung bis zum Audit? Gern teilweise vor Ort, Raum Baden-Württemberg.",
    must: ["ISO 27001", "Informationssicherheit"],
    nice: ["Audit-Erfahrung", "Datenschutz"],
    facts: [
      ["Arbeitsort", "hybrid, Baden-Württemberg"],
      ["Start", "1. Quartal 2027"],
      ["Dauer", "6 bis 9 Monate"],
    ],
    people: [
      {
        name: "Marc F.",
        avatar: avatar("marc"),
        role: "Transformation, Training & Audit",
        where: "Mahlberg · remote",
        rate: "980 € / Tag",
        availability: "Verfügbarkeit erfragen",
        available: false,
        verified: true,
        hits: [
          { label: "ISO 27001", state: "ok" },
          { label: "Informationssicherheit", state: "ok" },
          { label: "Audit-Erfahrung", state: "ok" },
          { label: "Vor Ort: im Gespräch klären", state: "open" },
        ],
        why: "Führt selbst ISO-27001-Audits durch und kennt die Prüferseite.",
      },
      {
        name: "Christopher L.",
        avatar: avatar("christopher"),
        role: "Microsoft-365- & Compliance-Berater",
        where: "Karlsruhe · auch vor Ort",
        rate: "Tagessatz auf Anfrage",
        availability: "verfügbar",
        available: true,
        verified: false,
        hits: [
          { label: "Informationssicherheit", state: "ok" },
          { label: "Datenschutz", state: "ok" },
          { label: "Vor Ort möglich", state: "info" },
          { label: "ISO-27001-Projekte: im Gespräch klären", state: "open" },
        ],
        why: "Vor Ort in Karlsruhe, stark bei Datenschutz und Microsoft 365.",
      },
    ],
  },
  {
    key: "schulung",
    tab: "Team schulen",
    request:
      "Unsere 20 Leute im Büro sollen lernen, KI sicher und sinnvoll zu nutzen. Ein halber Tag, gern vor Ort, sonst online.",
    must: ["KI-Schulung", "Praxisbeispiele"],
    nice: ["Didaktik", "KI-Strategie"],
    facts: [
      ["Arbeitsort", "vor Ort oder online"],
      ["Teilnehmer", "20 Personen"],
      ["Umfang", "ein halber Tag"],
    ],
    people: [
      {
        name: "Stefan N.",
        avatar: avatar("stefan"),
        role: "KI-Training, TÜV-zertifizierter KI-Berater",
        where: "Deutschland · remote",
        rate: "Tagessatz auf Anfrage",
        availability: "verfügbar",
        available: true,
        verified: true,
        hits: [
          { label: "KI-Schulung", state: "ok" },
          { label: "Didaktik", state: "ok" },
          { label: "Eigenes Schulungsmaterial", state: "info" },
          { label: "Vor Ort: im Gespräch klären", state: "open" },
        ],
        why: "Macht genau das: KI-Schulungen mit eigenem Material.",
      },
      {
        name: "Eric I.",
        avatar: avatar("eric"),
        role: "KI-Strategieberater & KI-Coach",
        where: "München · auch vor Ort",
        rate: "2.000 € / Tag",
        availability: "verfügbar",
        available: true,
        verified: false,
        hits: [
          { label: "KI-Schulung", state: "ok" },
          { label: "KI-Strategie", state: "ok" },
          { label: "Vor Ort möglich", state: "info" },
        ],
        why: "Coacht Teams und Geschäftsführung, auch bei Ihnen vor Ort.",
      },
      {
        name: "Silke H.",
        avatar: avatar("silke"),
        role: "KI Consultant & Project Manager",
        where: "Stuttgart · remote",
        rate: "880 € / Tag",
        availability: "verfügbar",
        available: true,
        verified: true,
        hits: [
          { label: "KI-Beratung", state: "ok" },
          { label: "Praxisbeispiele", state: "ok" },
          { label: "Schulungserfahrung: im Gespräch klären", state: "open" },
        ],
        why: "Bringt KI-Projekte aus Automobil und Handel mit.",
      },
    ],
  },
];

/** Die Gesichter in der Kachel „Talent Index“. */
export const DEMO_FACES: readonly string[] = ["patrick", "silke", "marc", "tomas", "stefan"].map(avatar);

/** „3 passen“, „1 passt“. */
export function matchCountLabel(count: number): string {
  return `${count} ${count === 1 ? "passt" : "passen"}`;
}
