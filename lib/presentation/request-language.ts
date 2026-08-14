/**
 * Detects the language a request was written in, for display only.
 *
 * This is deliberately NOT the same thing as `ProjectBrief.language`. That
 * field is a matching filter: `evaluateProfile` turns it into a rejection or a
 * known gap depending on how hard the requirement is. Writing a detected
 * language into it would attach a language requirement the client never stated
 * and would penalise every profile without documented languages.
 *
 * The detection therefore lives in the presentation layer, and the result is
 * carried in a separate field the matching code never reads.
 *
 * Scope is German versus English on purpose. Those are the only two languages
 * the corpus and the traffic actually contain, and a shallow detector for more
 * languages would return confident wrong answers instead of no answer. When the
 * text carries no clear signal the result is null and the UI shows nothing,
 * which is the honest outcome.
 */

export type DetectedRequestLanguage = "German" | "English";

/** Function words that rarely appear in the other language. */
const GERMAN_MARKERS = [
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem",
  "und", "oder", "aber", "nicht", "auch", "noch", "schon", "sehr", "mehr",
  "ist", "sind", "war", "waren", "wird", "werden", "wurde", "hat", "haben",
  "kann", "koennen", "können", "soll", "sollen", "muss", "müssen", "muessen",
  "fuer", "für", "mit", "von", "zum", "zur", "bei", "aus", "nach", "ueber",
  "über", "wir", "sie", "ich", "uns", "unser", "unsere", "ihre", "ihren",
  "suchen", "brauche", "brauchen", "benoetigen", "benötigen", "gesucht",
  "bitte", "moechte", "möchte", "waere", "wäre", "sowie", "damit", "dass",
];

const ENGLISH_MARKERS = [
  "the", "and", "for", "with", "from", "that", "this", "these", "those",
  "are", "was", "were", "will", "would", "should", "could", "have", "has",
  "need", "needs", "needed", "looking", "want", "wanted", "require",
  "required", "requirements", "please", "our", "your", "their", "must",
  "someone", "who", "able", "experience", "years", "project", "team",
];

/** Characters that only occur in German among the two candidates. */
const GERMAN_CHARACTERS = /[äöüß]/iu;

const words = (text: string): string[] =>
  text
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\s]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);

/**
 * Returns the language the text appears to be written in, or null when the
 * signal is too weak to claim one. A tie is also null — showing the wrong
 * language is worse than showing none.
 */
export function detectRequestLanguage(text: string): DetectedRequestLanguage | null {
  const tokens = words(text);
  if (tokens.length < 3) return null;

  const german = new Set(GERMAN_MARKERS);
  const english = new Set(ENGLISH_MARKERS);
  let germanHits = 0;
  let englishHits = 0;
  for (const token of tokens) {
    if (german.has(token)) germanHits += 1;
    if (english.has(token)) englishHits += 1;
  }

  // Umlauts and eszett are decisive on their own; no English text contains them
  // as part of ordinary words.
  if (GERMAN_CHARACTERS.test(text)) germanHits += 2;

  if (germanHits === englishHits) return null;
  // A single incidental hit is not enough to label the whole request.
  if (Math.max(germanHits, englishHits) < 2) return null;
  return germanHits > englishHits ? "German" : "English";
}
