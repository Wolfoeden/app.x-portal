/**
 * Die Eignung eines Profils in einem Satz.
 *
 * Die Karte trug die Bewertung bisher in vier gleich lauten Abzeichen
 * nebeneinander — "Hauptvorschlag", "Kernanforderungen 100 % belegt", "1 Punkt
 * offen", "Verfügbarkeit bestätigt". Alle vier gleich gross, keines zuerst.
 * Wer die Liste ueberfliegt, musste jedes Mal lesen statt zu sehen.
 *
 * Hier entsteht daraus eine Aussage mit einem Ton, den die Karte farblich
 * aufgreift. Die Prozentzahl bleibt daneben stehen, aber sie ist nicht mehr das
 * Erste, was jemand entziffern muss.
 */
import type { FreelancerProfileResult } from "../chat-contract";

export type FitTone = "strong" | "ok" | "warning";

export type FitSummary = {
  tone: FitTone;
  /** Die Aussage selbst, in ganzen Worten. */
  headline: string;
  /** Was diese Aussage traegt — Belege und offene Punkte. */
  detail: string;
  /** Anteil belegter Kernanforderungen, sofern bewertet. */
  coverage: number | null;
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function profileFitSummary(
  profile: Pick<
    FreelancerProfileResult,
    "recommendationRole" | "coreCoverage" | "knownGaps" | "matchReasons"
  >,
  recommendationThresholdPercent: number,
): FitSummary {
  const coverage = profile.coreCoverage;
  const gaps = profile.knownGaps.length;
  const reasons = profile.matchReasons.length;

  const evidence = reasons ? countLabel(reasons, "Beleg", "Belege") : "keine Belege übermittelt";
  const open = gaps ? countLabel(gaps, "offener Punkt", "offene Punkte") : "nichts offen";

  if (profile.recommendationRole === "partial") {
    return {
      tone: "warning",
      headline: gaps
        ? `${countLabel(gaps, "Muss-Kriterium", "Muss-Kriterien")} ohne Beleg`
        : "Muss-Kriterien nicht vollständig belegt",
      detail:
        coverage === null
          ? "Für eine Empfehlung reicht der Abgleich nicht."
          : `Empfohlen ab ${recommendationThresholdPercent} % — hier ${coverage} %.`,
      coverage,
    };
  }

  if (profile.recommendationRole === "primary") {
    return {
      tone: "strong",
      headline:
        coverage === 100
          ? "Erfüllt alle Kernanforderungen"
          : "Deckt die Anforderungen am weitesten ab",
      detail: `${evidence} · ${open}`,
      coverage,
    };
  }

  return {
    tone: "ok",
    headline: "Kommt als Alternative infrage",
    detail: `${evidence} · ${open}`,
    coverage,
  };
}
