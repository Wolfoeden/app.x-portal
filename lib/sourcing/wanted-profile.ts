/**
 * Das Wunschprofil: wie der Freelancer aussieht, der gebraucht wird.
 *
 * Die Nachfrageseite weiß, wonach Auftraggeber wiederholt gesucht haben und wo
 * der Katalog nichts hergab. Was dort fehlt, ist der Schritt von der
 * Auswertung zur Aufgabe — eine Beschreibung, mit der man losgehen und suchen
 * kann.
 *
 * **Es beschreibt niemanden.** Ein Wunschprofil ist ein Steckbrief, kein
 * Kandidat: Es sagt, welche Fähigkeiten, welche Arbeitsform und welche Sprache
 * gefragt sind, und wie oft. Es enthält keinen Namen, keine Adresse und keine
 * Person — die kommt erst dazu, wenn jemand gefunden wurde.
 *
 * Erzeugt wird es rein aus dem, was das Nachfrageprofil belegt. Kein Modell,
 * keine Ausschmückung: Was hier steht, steht auch in den Zahlen daneben, und
 * genau das macht es als Suchauftrag brauchbar.
 */

export type DemandFacet = { label: string; count: number };

export type WantedProfileInput = {
  /** Der Schlüssel des Nachfrageprofils, aus dem es entsteht. */
  profileKey: string;
  profileLabel: string;
  requiredSkills: readonly DemandFacet[];
  optionalSkills: readonly DemandFacet[];
  /** Kompetenzen, an denen der Abgleich wiederholt gescheitert ist. */
  openSupplyGaps: readonly DemandFacet[];
  locations: readonly DemandFacet[];
  workModes: readonly DemandFacet[];
  languages: readonly DemandFacet[];
  /** Wie oft gesucht wurde und von wie vielen. */
  searches: number;
  uniqueSeekers: number;
  /** Wie oft der Katalog nichts hergab. */
  noReliableMatch: number;
  /** Durchschnittliche Zahl der Vorschläge, wenn es welche gab. */
  averageResults: number;
};

export type WantedProfile = {
  profileKey: string;
  /** Die Rolle, wie sie in einer Suche stehen würde. */
  roleTitle: string;
  /** Was die Person können muss. Ohne diese Kompetenzen passt sie nicht. */
  mustHave: string[];
  /** Was zusätzlich gefragt war, aber nicht in jeder Anfrage. */
  niceToHave: string[];
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  location: string | null;
  languages: string[];
  /** Ein Satz, der den belegten Bedarf benennt. */
  evidence: string;
  /** Was den Ausschlag gibt: die Kompetenzen, an denen es bisher scheiterte. */
  criticalGaps: string[];
};

const MAX_MUST = 6;
const MAX_NICE = 6;

function labels(facets: readonly DemandFacet[], max: number): string[] {
  return facets
    .map((facet) => facet.label.trim())
    .filter(Boolean)
    .slice(0, max);
}

function workModeOf(facets: readonly DemandFacet[]): WantedProfile["workMode"] {
  const oben = facets[0]?.label;
  return oben === "remote" || oben === "on_site" || oben === "hybrid"
    ? oben
    : "unknown";
}

/**
 * Die Rollenbezeichnung.
 *
 * Aus den beiden führenden Pflichtkompetenzen, weil das Nachfrageprofil selbst
 * so gebildet ist. Eine Rolle zu erfinden — „Senior Fullstack Engineer" —
 * wäre eine Behauptung über eine Stelle, die niemand ausgeschrieben hat.
 */
function roleFrom(input: WantedProfileInput): string {
  const fuehrend = labels(input.requiredSkills, 2);
  if (fuehrend.length === 0) return input.profileLabel;
  return `Freelancer für ${fuehrend.join(" und ")}`;
}

/**
 * Der Satz, der den Bedarf belegt.
 *
 * Zahlen statt Adjektive: „vierzehn Anfragen von sechs Auftraggebern, zwölf
 * davon ohne Treffer" trägt eine Entscheidung, „hohe Nachfrage" nicht.
 */
function evidenceFrom(input: WantedProfileInput): string {
  const teile = [
    `${input.searches} ${input.searches === 1 ? "Anfrage" : "Anfragen"}`,
  ];
  if (input.uniqueSeekers > 0) {
    teile.push(
      `von ${input.uniqueSeekers} ${input.uniqueSeekers === 1 ? "Auftraggeber" : "verschiedenen Auftraggebern"}`,
    );
  }
  if (input.noReliableMatch > 0) {
    teile.push(`${input.noReliableMatch} davon ohne Treffer im Katalog`);
  }
  if (input.averageResults > 0) {
    teile.push(
      `im Schnitt ${input.averageResults.toFixed(1).replace(".", ",")} Vorschläge`,
    );
  }
  return teile.join(", ");
}

export function buildWantedProfile(input: WantedProfileInput): WantedProfile {
  const mustHave = labels(input.requiredSkills, MAX_MUST);
  // Was schon Pflicht ist, steht nicht noch einmal als Kür daneben.
  const bekannt = new Set(mustHave.map((wert) => wert.toLowerCase()));
  const niceToHave = labels(input.optionalSkills, MAX_NICE + MAX_MUST).filter(
    (wert) => !bekannt.has(wert.toLowerCase()),
  );

  return {
    profileKey: input.profileKey,
    roleTitle: roleFrom(input),
    mustHave,
    niceToHave: niceToHave.slice(0, MAX_NICE),
    workMode: workModeOf(input.workModes),
    location: input.locations[0]?.label.trim() || null,
    languages: labels(input.languages, 3),
    evidence: evidenceFrom(input),
    criticalGaps: labels(input.openSupplyGaps, 4),
  };
}

/**
 * Das Wunschprofil als Text zum Weiterreichen.
 *
 * Damit lässt sich sofort etwas anfangen — in eine Suchmaske einfügen, an
 * jemanden schicken, in ein Werkzeug kippen —, ohne dass dafür erst eine
 * Schnittstelle gebaut sein muss.
 */
export function wantedProfileText(profil: WantedProfile): string {
  const arbeitsform: Record<WantedProfile["workMode"], string> = {
    remote: "remote",
    on_site: "vor Ort",
    hybrid: "hybrid",
    unknown: "nicht festgelegt",
  };

  return [
    profil.roleTitle,
    "",
    `Muss können: ${profil.mustHave.join(", ") || "—"}`,
    profil.niceToHave.length ? `Von Vorteil: ${profil.niceToHave.join(", ")}` : null,
    `Arbeitsform: ${arbeitsform[profil.workMode]}${profil.location ? ` · ${profil.location}` : ""}`,
    profil.languages.length ? `Sprache: ${profil.languages.join(", ")}` : null,
    profil.criticalGaps.length
      ? `Daran scheiterte es bisher: ${profil.criticalGaps.join(", ")}`
      : null,
    "",
    `Belegte Nachfrage: ${profil.evidence}`,
  ]
    .filter((zeile) => zeile !== null)
    .join("\n");
}
