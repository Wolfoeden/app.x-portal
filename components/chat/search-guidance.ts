import type { MatchingStatus, StructuredBrief } from "../chat-contract";
import { BRIEF_GAP } from "./example-briefs";
import { openBriefFields } from "./open-fields";

/**
 * Was nach einer Analyse als Nächstes hilft — als Tipp in der Antwort und als
 * Vorschlag über dem Eingabefeld, aus derselben Quelle. Ziel: Wer beim ersten
 * Mal kein passendes Profil sieht, sucht weiter statt aufzugeben.
 *
 * Abgeleitet nur aus dem, was der Client hat: der strukturierten Anfrage und
 * dem Ergebnis. Keine Behauptung, die die Daten nicht tragen — „kann
 * ausschließen“, nicht „hat ausgeschlossen“.
 */

export type GuidanceAction =
  /** Text ins Eingabefeld; „…“ markiert, was der Nutzer ergänzt. */
  | { kind: "prefill"; text: string }
  /** Die Suchkriterien unter dem Ergebnis aufklappen. */
  | { kind: "criteria" }
  /** Zum Suchauftrag oder zur öffentlichen Recherche im Ergebnis springen. */
  | { kind: "scroll"; target: "mandate" | "research" };

export type GuidanceSuggestion = { key: string; label: string; action: GuidanceAction };

export type SearchGuidance = {
  tips: string[];
  suggestions: GuidanceSuggestion[];
};

const MAX_TIPS = 3;
const MAX_SUGGESTIONS = 4;

function skillValues(brief: StructuredBrief, priority: "hard" | "core"): string[] {
  const values = brief.requirementGroups
    .filter((group) => group.category === "skill" && group.priority === priority)
    .flatMap((group) => group.values);
  return [...new Set(values)];
}

function list(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} und ${values.at(-1)}`;
}

const OPEN_FIELD_TIPS: Readonly<Record<string, { tip: string; label: string; text: string }>> = {
  Startzeitraum: {
    tip: "Nennen Sie den Startzeitraum: Dann prüft XPORTAL die Verfügbarkeit gleich mit.",
    label: "Start ergänzen",
    text: `Start: ${BRIEF_GAP}`,
  },
  "Budget oder Tagessatz": {
    tip: "Mit Budget oder Tagessatz sehen Sie sofort, wer preislich passt.",
    label: "Budget ergänzen",
    text: `Budget: bis ${BRIEF_GAP} € pro Tag`,
  },
  Dauer: {
    tip: "Die Projektdauer hilft einzuschätzen, wer zeitlich passt.",
    label: "Dauer ergänzen",
    text: `Dauer: ${BRIEF_GAP} Monate`,
  },
  Arbeitsmodus: {
    tip: "Remote, hybrid oder vor Ort? Das grenzt die Auswahl sinnvoll ein.",
    label: "Arbeitsmodus nennen",
    text: `Arbeitsmodus: ${BRIEF_GAP}`,
  },
};

export function searchGuidance(input: {
  brief: StructuredBrief | null;
  matchingStatus: MatchingStatus | null;
  /** Empfohlene Profile, die noch zu sehen sind. */
  profileCount: number;
  /** Teiltreffer, die noch zu sehen sind. */
  partialCount: number;
  /** Ob unter dem Ergebnis eine öffentliche Recherche angeboten wird. */
  researchAvailable: boolean;
}): SearchGuidance {
  const { brief, matchingStatus, profileCount, partialCount, researchAvailable } = input;
  if (!brief || !matchingStatus) return { tips: [], suggestions: [] };

  if (matchingStatus === "needs_clarification") {
    return {
      tips: ["Nennen Sie die gesuchte Rolle und zwei, drei Kernkompetenzen, etwa „Senior React-Entwickler mit TypeScript und Next.js“."],
      suggestions: [
        { key: "role", label: "Rolle und Kompetenzen nennen", action: { kind: "prefill", text: `Gesucht wird: ${BRIEF_GAP}. Wichtig sind: ${BRIEF_GAP}` } },
      ],
    };
  }

  const tips: string[] = [];
  const suggestions: GuidanceSuggestion[] = [];

  if (matchingStatus === "no_reliable_match" || profileCount === 0) {
    const hard = skillValues(brief, "hard");
    if (hard.length >= 2) {
      tips.push(`Alle ${hard.length} Muss-Kompetenzen zugleich (${list(hard)}) erfüllt im Bestand noch niemand. Ist eine davon verhandelbar, kommen mehr Profile in Frage.`);
    }
    if (brief.budgetOrRate) {
      tips.push(`Ihr Budget (${brief.budgetOrRate}) kann erfahrene Profile ausschließen. Mit etwas Spielraum wird die Auswahl größer.`);
    }
    if (brief.mode === "on-site") {
      tips.push("Nur vor Ort schränkt stark ein; remote oder hybrid erweitert die Auswahl deutlich.");
    }
    if (partialCount > 0) {
      tips.push(`${partialCount === 1 ? "Ein Profil erfüllt" : `${partialCount} Profile erfüllen`} einen Teil. Ein kurzes Gespräch klärt oft, ob die Lücke wirklich zählt.`);
    }
    if (!tips.length) {
      tips.push("Formulieren Sie die Anforderungen etwas allgemeiner oder nennen Sie verwandte Technologien, die auch passen.");
    }

    suggestions.push({
      key: "criteria",
      label: "Kriterien lockern",
      action: { kind: "criteria" },
    });
    if (brief.mode === "on-site" || brief.mode === "hybrid") {
      suggestions.push({ key: "remote", label: "Remote zulassen", action: { kind: "prefill", text: "Remote-Arbeit ist auch möglich." } });
    }
    suggestions.push({ key: "mandate", label: "Suchauftrag erstellen", action: { kind: "scroll", target: "mandate" } });
    if (researchAvailable) {
      suggestions.push({ key: "research", label: "Öffentlich weitersuchen", action: { kind: "scroll", target: "research" } });
    }
    suggestions.push({ key: "related", label: "Verwandte Kompetenzen", action: { kind: "prefill", text: `Verwandte Kompetenzen sind auch in Ordnung, zum Beispiel ${BRIEF_GAP}` } });
    return { tips: tips.slice(0, MAX_TIPS), suggestions: suggestions.slice(0, MAX_SUGGESTIONS) };
  }

  // Treffer da: fehlende Angaben machen die Auswahl genauer.
  for (const field of openBriefFields(brief)) {
    const entry = OPEN_FIELD_TIPS[field];
    if (!entry) continue;
    tips.push(entry.tip);
    suggestions.push({ key: field, label: entry.label, action: { kind: "prefill", text: entry.text } });
  }
  suggestions.push({ key: "more", label: "Weitere Anforderung ergänzen", action: { kind: "prefill", text: `Zusätzlich wichtig: ${BRIEF_GAP}` } });
  return { tips: tips.slice(0, 2), suggestions: suggestions.slice(0, MAX_SUGGESTIONS) };
}
