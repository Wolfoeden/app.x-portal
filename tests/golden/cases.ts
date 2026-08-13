/**
 * Golden-set cases.
 *
 * A case is a brief plus a note explaining what the expected order is meant to
 * protect. Expected results live in `expected.json` so a deliberate behaviour
 * change can be re-baselined with GOLDEN_SNAPSHOT=1 instead of hand-editing
 * every case.
 */

import {
  type BriefFactField,
  type ProjectBrief,
  ProjectBriefSchema,
  deriveUnknownFields,
} from "../../lib/domain";

type BriefInput = Omit<ProjectBrief, "schemaVersion" | "unknownFields">;

/** Builds a schema-valid brief and derives `unknownFields` instead of hand-listing them. */
export const brief = (input: BriefInput): ProjectBrief =>
  ProjectBriefSchema.parse({
    ...input,
    schemaVersion: 1,
    unknownFields: deriveUnknownFields(input as Parameters<typeof deriveUnknownFields>[0]) as
      BriefFactField[],
  });

export type GoldenCase = {
  readonly id: string;
  readonly note: string;
  readonly brief: ProjectBrief;
  /**
   * Set when the recorded baseline is known to be WRONG and only kept to detect
   * drift. `expected.json` records what the code does today, not what it should
   * do — without this marker the baseline reads as an endorsement. The value
   * names the work item that is expected to change it.
   */
  readonly knownDefect?: string;
};

/**
 * Source text of the reference posting. Shortened, and the named contact person
 * removed — the posting is public, that individual's name does not belong in a
 * test fixture.
 */
const businessEngineerRequest = `Business Engineer (m/w/d) // Remote/GR Frankfurt // Juli 2026, 36 Monate

Einsatzort: 80% remote, 20% vor Ort im Grossraum Frankfurt
Start: Juli 2026
Dauer: 36 Monate
Auslastung: 100%

Ihre Aufgaben:
- Unterstuetzung des Product Owners bei der Anforderungsklaerung mit Fachbereichen, Architekten und Entwicklungsteams
- Durchfuehrung von Stakeholder-Interviews sowie Moderation von Workshops
- Analyse, Strukturierung und Dokumentation funktionaler und nicht-funktionaler Anforderungen
- Erstellung und Pflege von Epics, Features und User Stories gemaess SAFe-Vorgehensmodell
- Analyse und Optimierung bestehender Geschaeftsprozesse
- Beratung des Product Owners im Risikomanagement
- Durchfuehrung explorativer Datenanalysen zur Ableitung fachlicher und technischer Anforderungen

Ihr Profil:
- Muss zwingend: Fundierte Kenntnisse im funktionalen Architektur- und Anforderungsmanagement
- Sehr gute Kenntnisse in Geschaeftsprozessanalyse und -gestaltung
- Erfahrung in der Erstellung von Features, User Stories und fachlichen Testfaellen
- Verstaendnis von Python oder C++ zur Analyse bestehender Systeme und Schnittstellen
- Muss zwingend: sehr gute Deutschkenntnisse in Wort und Schrift`;

const businessEngineerCommon = {
  originalRequest: businessEngineerRequest,
  projectTitle: "Business Engineer (m/w/d)",
  summary:
    "Business Engineer fuer ein Mobilitaetsprojekt: Anforderungsmanagement und Geschaeftsprozessanalyse nach SAFe, 80% remote und 20% vor Ort in Frankfurt, Start Juli 2026, Laufzeit 36 Monate.",
  language: "German",
  workMode: "hybrid" as const,
  location: "Frankfurt am Main",
  startWindow: { raw: "Juli 2026", earliest: "2026-07-01", latest: "2026-07-31" },
  duration: { raw: "36 Monate", value: 36, unit: "months" as const },
  budget: null,
  rate: null,
  qualifications: null,
  availabilityRequirement: null,
  contractualRequirements: null,
  constraints: ["100% Auslastung"],
};

export const goldenCases: readonly GoldenCase[] = [
  {
    id: "business-engineer-de",
    note:
      "Reference posting with the skill terms in German, the way a German brief is written. " +
      "Measured on the real 65-row export this returned 2 eligible profiles and ranked a QA " +
      "test manager first, because the skill families carry no German aliases. The German and " +
      "the English variant of this case must produce the same shortlist.",
    brief: brief({
      ...businessEngineerCommon,
      requiredSkills: ["Anforderungsmanagement", "Geschäftsprozessanalyse", "SAFe"],
      optionalSkills: ["Python", "Datenanalyse", "Risikomanagement"],
    }),
  },
  {
    id: "business-engineer-en",
    note:
      "Same posting, same profiles, skill terms in the canonical English form the skill families " +
      "already know. Paired with business-engineer-de: a divergence between the two is the " +
      "language-dependency regression.",
    brief: brief({
      ...businessEngineerCommon,
      requiredSkills: ["requirements management", "process analysis", "SAFe"],
      optionalSkills: ["python", "data analysis", "risk management"],
    }),
  },
  {
    id: "empty-brief",
    note:
      "A greeting with no extractable requirement. Must return zero matches. Returning anything " +
      "here means the shortlist fell through to alphabetical order over every active profile.",
    brief: brief({
      originalRequest: "Hallo, ich brauche Hilfe.",
      projectTitle: null,
      summary: "Unspezifische Anfrage ohne erkennbare Anforderung.",
      requiredSkills: null,
      optionalSkills: null,
      language: null,
      workMode: "unknown",
      location: null,
      startWindow: null,
      duration: null,
      budget: null,
      rate: null,
      constraints: null,
      qualifications: null,
      availabilityRequirement: null,
      contractualRequirements: null,
    }),
  },
  {
    id: "verified-beats-exact",
    knownDefect:
      "Verification still does not decide this case. Since v9 removed the literal-string " +
      "criterion the three candidates tie on skills, and availability breaks the tie before " +
      "verification is ever consulted — the verified profile ranks third. Raising verification " +
      "above availability is deliberately deferred: verified facts exist on only 6 of 65 " +
      "production rows, so the criterion would sort on an almost empty field.",
    note:
      "One profile carries the requested term verbatim but self-reported; another carries a " +
      "family alias that is operator-verified. Kept as the guard for where verification sits in " +
      "the ordering, and as the case that will move when verification data actually exists.",
    brief: brief({
      originalRequest: "Wir suchen Unterstuetzung im requirements management, remote.",
      projectTitle: "Requirements Management Support",
      summary: "Unterstuetzung im Anforderungsmanagement, remote.",
      requiredSkills: ["requirements management"],
      optionalSkills: null,
      language: null,
      workMode: "remote",
      location: null,
      startWindow: null,
      duration: null,
      budget: null,
      rate: null,
      constraints: null,
      qualifications: null,
      availabilityRequirement: null,
      contractualRequirements: null,
    }),
  },
  {
    id: "hard-language-unmet",
    note:
      "A hard French requirement against a pool that speaks German and English. Profiles with " +
      "documented languages and profiles with none must be treated identically. Written with the " +
      "umlaut-free 'Franzoesisch' on purpose: searchText folds 'ö' to 'o' but cannot fold 'oe', " +
      "so this also guards the transliterated spelling German keyboards produce.",
    brief: brief({
      originalRequest:
        "Business Analyst gesucht.\nMuss zwingend: Franzoesisch in Wort und Schrift.",
      projectTitle: "Business Analyst",
      summary: "Business Analyst mit zwingend franzoesischer Sprache.",
      requiredSkills: ["business analysis"],
      optionalSkills: null,
      language: "French",
      workMode: "remote",
      location: null,
      startWindow: null,
      duration: null,
      budget: null,
      rate: null,
      constraints: null,
      qualifications: null,
      availabilityRequirement: null,
      contractualRequirements: null,
    }),
  },
  {
    id: "onsite-munich",
    note:
      "On-site work in Munich. Guards the location and work-mode filters, including the profile " +
      "that only works on site.",
    brief: brief({
      originalRequest:
        "Business Analyst vor Ort in Muenchen gesucht, Prozessanalyse und Anforderungen.",
      projectTitle: "Business Analyst Muenchen",
      summary: "Business Analyst fuer Prozessanalyse vor Ort in Muenchen.",
      requiredSkills: ["business analysis", "process analysis"],
      optionalSkills: null,
      language: "German",
      workMode: "on_site",
      location: "München",
      startWindow: null,
      duration: null,
      budget: null,
      rate: null,
      constraints: null,
      qualifications: null,
      availabilityRequirement: null,
      contractualRequirements: null,
    }),
  },
];
