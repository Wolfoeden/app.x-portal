/**
 * Suchbegriffe für die Freelancer-Websuche.
 *
 * Bisher hat das Modell seine Anfragen selbst formuliert. Dabei entstanden
 * Stichwortsuppen wie "IT Support Helpdesk 1st 2nd Level ticketing
 * Störungsbehebung freelancer Remote" — und die finden Stellenanzeigen,
 * Agenturen und PDFs, aber keine Personen. In einem echten Lauf war genau eine
 * Anfrage gezielt (`site:linkedin.com`), und sie brachte den einzigen
 * brauchbaren Treffer.
 *
 * Die Anfragen entstehen deshalb hier, deterministisch aus dem Brief und der
 * geprüften Skill-Taxonomie. Das Modell bekommt sie vorgegeben.
 */

import { skillDefinition, skillTerms } from "@/lib/domain/skill-taxonomy";

/**
 * Was diese Suche ausdrücklich nicht sucht. Eine Seite, die Arbeit anbietet,
 * ist keine Person, die ihre Dienste anbietet.
 */
export const JOB_AD_EXCLUSIONS = [
  "-jobs",
  "-stellenangebot",
  "-stellenanzeige",
  "-jobangebot",
  "-karriere",
  "-vacancy",
] as const;

export const MAX_SEARCH_QUERIES = 5;

export type SearchQuery = {
  /** Kennung der Vorlage, damit später messbar ist, welche etwas bringt. */
  template: "linkedin" | "xing" | "own_site" | "code_profile" | "broad";
  query: string;
};

type QueryBrief = {
  requiredSkills?: readonly string[] | null;
  optionalSkills?: readonly string[] | null;
  projectTitle?: string | null;
  originalRequest?: string | null;
  location?: string | null;
  language?: string | null;
  workMode?: string | null;
};

/**
 * Wörter, die in einem Projekttitel stehen, aber in keinem Profil.
 */
const TITLE_NOISE = new Set([
  "level",
  "senior",
  "junior",
  "gesucht",
  "freelancer",
  "freiberuflich",
  "remote",
  "projekt",
  "unterstützung",
  "verstärkung",
  "und",
  "oder",
  "für",
  "mit",
  "the",
  "and",
  "for",
]);

/**
 * Der Projekttitel nennt die Rolle — "IT-Support", "Helpdesk" — und genau die
 * steht in Profilen. Die extrahierten Kompetenzen sind dagegen oft Prosa
 * ("Störungsbehebung"), nach der niemand sucht.
 */
function roleGroup(brief: QueryBrief, maxTerms = 2): string {
  const parts = (brief.projectTitle ?? "")
    .split(/[()&,/|·–—:]+|\s+/u)
    .map((part) => part.replace(/[^\p{Letter}\p{Number}-]/gu, "").trim())
    .filter(
      (part) =>
        part.length >= 3 &&
        !/^\d/u.test(part) &&
        !TITLE_NOISE.has(part.toLocaleLowerCase("de-DE")),
    );
  const terms = [...new Set(parts)].slice(0, maxTerms).map(quote);
  if (terms.length === 0) return "";
  return terms.length === 1 ? terms[0]! : `(${terms.join(" OR ")})`;
}

/** Begriffe, die auf Programmier- oder Datenarbeit hindeuten. */
const CODE_MARKERS =
  /(?:typescript|javascript|react|node|python|java\b|php|golang|rust|kotlin|swift|sql|postgres|docker|kubernetes|api|backend|frontend|devops|data|machine learning|llm|rag)/iu;

function quote(term: string): string {
  const cleaned = term.trim().replace(/["]/gu, "");
  return cleaned.includes(" ") ? `"${cleaned}"` : cleaned;
}

/**
 * Deutsche Fachbegriffe sind meist ein zusammengesetztes Wort — "Anforderungs-
 * management" gegen "requirements engineering". Bei einer deutschen Anfrage
 * ist genau dieses Wort das, was jemand in sein Profil schreibt.
 */
function looksGerman(term: string): boolean {
  return /[äöüß]/iu.test(term) || (!term.includes(" ") && term.length >= 10);
}

/**
 * Ein Skill wird zu einer Oder-Gruppe aus kanonischem Begriff und Synonymen.
 * Mehr als drei Varianten machen die Anfrage unbrauchbar lang, ohne mehr zu
 * treffen — deshalb entscheidet die Sprache, welche drei es sind.
 */
function skillGroup(skill: string, german: boolean, maxTerms = 3): string {
  const all = [...skillTerms(skill)]
    .map((term) => term.trim())
    .filter(Boolean);
  const [canonical, ...aliases] = all;
  if (!canonical) return "";

  const preferred = german
    ? [...aliases].sort(
        (left, right) => Number(looksGerman(right)) - Number(looksGerman(left)),
      )
    : aliases;

  const terms = [...new Set([canonical, ...preferred])]
    .slice(0, maxTerms)
    .map(quote);
  return terms.length === 1 ? terms[0]! : `(${terms.join(" OR ")})`;
}

/**
 * `brief.language` ist regelmäßig null — die Anzeige leitet die Sprache
 * anderswo ab. Deshalb entscheidet hier notfalls der Text selbst; eine deutsche
 * Anfrage als englisch zu behandeln kostet Xing und die deutschen Fachbegriffe.
 */
function isGerman(brief: QueryBrief): boolean {
  const language = brief.language?.toLowerCase() ?? "";
  if (language.includes("german") || language.includes("deutsch")) return true;
  if (language) return false;

  const location = brief.location?.toLowerCase() ?? "";
  if (
    /(?:deutschland|germany|österreich|austria|schweiz|berlin|münchen|hamburg|köln|frankfurt)/u.test(
      location,
    )
  ) {
    return true;
  }

  const text = `${brief.projectTitle ?? ""} ${brief.originalRequest ?? ""}`;
  return (
    /[äöüß]/iu.test(text) ||
    /\b(?:wir|und|für|mit|eine|einen|brauchen|suchen|unsere|unser|bei|der|die|das)\b/iu.test(
      text,
    )
  );
}

/**
 * Ort für die Anfrage. Ohne Ortsangabe im Brief wird bei deutschsprachigen
 * Anfragen "Deutschland" ergänzt — sonst dominieren internationale Treffer.
 */
function regionTerm(brief: QueryBrief): string {
  const location = brief.location?.trim();
  if (location) return quote(location);
  return isGerman(brief) ? "Deutschland" : "";
}

function freelanceTerm(brief: QueryBrief): string {
  return isGerman(brief)
    ? "(freelancer OR freiberuflich OR selbstständig)"
    : "(freelancer OR freelance OR contractor)";
}

function looksTechnical(brief: QueryBrief): boolean {
  const haystack = [
    brief.projectTitle ?? "",
    ...(brief.requiredSkills ?? []),
    ...(brief.optionalSkills ?? []),
  ].join(" ");
  return CODE_MARKERS.test(haystack);
}

function assemble(parts: readonly string[]): string {
  return [...parts, ...JOB_AD_EXCLUSIONS]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Baut bis zu fünf Anfragen. Die Reihenfolge ist die Rangfolge: Berufsprofile
 * zuerst, die breite Suche zuletzt als Auffangnetz.
 */
export function buildSearchQueries(brief: QueryBrief): SearchQuery[] {
  const skills = (brief.requiredSkills ?? []).filter((skill) => skill?.trim());
  const fallbackSkills = skills.length
    ? skills
    : (brief.optionalSkills ?? []).filter((skill) => skill?.trim());
  const usable = fallbackSkills.length
    ? fallbackSkills
    : [brief.projectTitle ?? ""].filter((value) => value.trim());
  if (usable.length === 0) return [];

  const german = isGerman(brief);
  const role = roleGroup(brief);
  // Ein Begriff aus der geprüften Taxonomie ist ein echter Fachbegriff. Steht
  // dort nichts, ist die extrahierte "Kompetenz" meist Prosa — dann führt die
  // Rolle aus dem Titel die Anfrage an.
  const firstIsRealSkill = skillDefinition(usable[0]!) !== null;
  const skillPrimary = skillGroup(usable[0]!, german);
  const skillSecondary = usable[1] ? skillGroup(usable[1]!, german, 2) : "";

  const primary = firstIsRealSkill || !role ? skillPrimary : role;
  const secondary =
    firstIsRealSkill || !role
      ? skillSecondary || role
      : skillPrimary;
  const region = regionTerm(brief);
  const freelance = freelanceTerm(brief);

  const queries: SearchQuery[] = [
    {
      template: "linkedin",
      query: assemble([
        "site:linkedin.com/in",
        primary,
        secondary,
        freelance,
        region,
      ]),
    },
  ];

  // Xing ist im deutschsprachigen Raum für viele Berufsgruppen relevanter als
  // LinkedIn und kam in den bisherigen Läufen nie vor.
  if (german) {
    queries.push({
      template: "xing",
      query: assemble(["site:xing.com/profile", primary, freelance, region]),
    });
  }

  queries.push({
    template: "own_site",
    query: assemble([
      primary,
      secondary,
      freelance,
      german
        ? '(portfolio OR "über mich" OR impressum OR referenzen)'
        : '(portfolio OR "about me" OR "case studies")',
      region,
    ]),
  });

  if (looksTechnical(brief)) {
    queries.push({
      template: "code_profile",
      query: assemble(["site:github.com", primary, region]),
    });
  }

  queries.push({
    template: "broad",
    query: assemble([primary, secondary, freelance, region]),
  });

  return queries.slice(0, MAX_SEARCH_QUERIES);
}
