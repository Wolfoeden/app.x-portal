/**
 * Die Projektdaten in der rechten Leiste von Hand aendern.
 *
 * Bisher entstand der Steckbrief ausschliesslich aus dem Chat: wer den Ort
 * korrigieren wollte, musste einen Satz darueber schreiben und hoffen, dass er
 * richtig verstanden wird. Die Felder sind jetzt beschreibbar.
 *
 * Der geaenderte Stand geht bewusst nicht als fertiger Steckbrief an den
 * Server, sondern als Nachricht durch dieselbe Chat-Strecke wie alles andere.
 * Das hat zwei Gruende: die Auswertung bleibt an einer Stelle, statt einmal im
 * Modell und einmal im Formular zu existieren, und die Aenderung steht danach
 * im Verlauf — sonst aendert sich die Trefferliste, ohne dass im Gespraech
 * ersichtlich waere, warum.
 */
import type { ProjectMode, StructuredBrief } from "../chat-contract";

export type BriefDraftField =
  | "projectTitle"
  | "hardRequirements"
  | "coreRequirements"
  | "optionalRequirements"
  | "mode"
  | "location"
  | "startWindow"
  | "duration"
  | "budgetOrRate"
  | "availabilityRequirement"
  | "languages"
  | "contractualRequirements";

export type BriefDraft = Record<BriefDraftField, string>;

export const MODE_OPTIONS: ReadonlyArray<{ value: ProjectMode; label: string }> = [
  { value: "unknown", label: "Nicht festgelegt" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "Vor Ort" },
];

/**
 * Die Beschriftung ist zugleich der Name, unter dem das Feld spaeter in der
 * Nachricht auftaucht. Beides auseinanderzuhalten hiesse, denselben Begriff an
 * zwei Stellen zu pflegen.
 */
export const BRIEF_FIELDS: ReadonlyArray<{
  field: BriefDraftField;
  label: string;
  hint?: string;
  multiline?: boolean;
  placeholder: string;
}> = [
  { field: "projectTitle", label: "Projekt", placeholder: "Wofür suchen Sie?" },
  {
    field: "hardRequirements",
    label: "Muss",
    hint: "Ohne Beleg fällt ein Profil raus",
    multiline: true,
    placeholder: "z. B. SAP FI/CO, Deutsch verhandlungssicher",
  },
  {
    field: "coreRequirements",
    label: "Kern",
    hint: "Bestimmt die Reihenfolge",
    multiline: true,
    placeholder: "z. B. S/4HANA-Migration",
  },
  {
    field: "optionalRequirements",
    label: "Optional",
    multiline: true,
    placeholder: "Nice to have",
  },
  { field: "mode", label: "Arbeitsmodus", placeholder: "" },
  { field: "location", label: "Ort", placeholder: "z. B. Berlin oder DACH" },
  { field: "startWindow", label: "Start", placeholder: "z. B. ab Oktober" },
  { field: "duration", label: "Dauer", placeholder: "z. B. 6 Monate" },
  { field: "budgetOrRate", label: "Budget oder Satz", placeholder: "z. B. bis 900 €/Tag" },
  {
    field: "availabilityRequirement",
    label: "Verfügbarkeit",
    placeholder: "z. B. mindestens 3 Tage/Woche",
  },
  { field: "languages", label: "Sprachen", placeholder: "z. B. Deutsch, Englisch" },
  {
    field: "contractualRequirements",
    label: "Vertragliches",
    multiline: true,
    placeholder: "z. B. Rahmenvertrag, NDA",
  },
];

function requirementText(
  brief: StructuredBrief,
  priority: "hard" | "core" | "optional",
): string {
  return brief.requirementGroups
    .filter((group) => group.priority === priority)
    .map((group) => group.values.join(group.operator === "any_of" ? " oder " : " und "))
    .join(", ");
}

/** Legt den Steckbrief in die Form, in der er sich bearbeiten laesst. */
export function briefToDraft(brief: StructuredBrief | null): BriefDraft {
  if (!brief) {
    return {
      projectTitle: "",
      hardRequirements: "",
      coreRequirements: "",
      optionalRequirements: "",
      mode: "unknown",
      location: "",
      startWindow: "",
      duration: "",
      budgetOrRate: "",
      availabilityRequirement: "",
      languages: "",
      contractualRequirements: "",
    };
  }

  return {
    projectTitle: brief.projectTitle ?? "",
    hardRequirements: requirementText(brief, "hard"),
    coreRequirements: requirementText(brief, "core"),
    optionalRequirements: requirementText(brief, "optional"),
    mode: brief.mode,
    location: brief.location ?? "",
    startWindow: brief.startWindow ?? "",
    duration: brief.duration ?? "",
    budgetOrRate: brief.budgetOrRate ?? "",
    availabilityRequirement: brief.availabilityRequirement ?? "",
    languages: brief.languages.join(", "),
    contractualRequirements: brief.contractualRequirements.join(", "),
  };
}

export type BriefChange = { field: BriefDraftField; label: string; value: string };

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Welche Felder hat der Nutzer angefasst?
 *
 * Verglichen wird normalisiert, damit ein versehentliches Leerzeichen am Ende
 * keine Suche ausloest — eine Suche kostet Guthaben.
 */
export function draftChanges(base: BriefDraft, draft: BriefDraft): BriefChange[] {
  return BRIEF_FIELDS.filter(
    ({ field }) => normalize(base[field]) !== normalize(draft[field]),
  ).map(({ field, label }) => ({ field, label, value: normalize(draft[field]) }));
}

function modeLabel(value: string): string {
  return MODE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/**
 * Formuliert die Aenderung als Nachricht.
 *
 * Ein geleertes Feld wird ausdruecklich als gestrichen benannt. Liesse man es
 * einfach weg, waere die Nachricht von "dazu sage ich nichts" nicht zu
 * unterscheiden, und die Anforderung bliebe stehen.
 */
export function composeBriefUpdateMessage(changes: BriefChange[]): string {
  if (!changes.length) return "";
  const lines = changes.map(({ field, label, value }) => {
    if (!value) return `- ${label}: entfällt`;
    if (field === "mode") return `- ${label}: ${modeLabel(value)}`;
    return `- ${label}: ${value}`;
  });
  return [
    "Ich habe die Projektdaten angepasst. Bitte suche mit diesem Stand erneut:",
    ...lines,
  ].join("\n");
}
