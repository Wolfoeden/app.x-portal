/**
 * Die Selbstauskunft eines Freelancers kuerzen.
 *
 * Unter "Vom Freelancer angegeben" stehen Angaben, die niemand geprueft hat.
 * Sie sind oft lang und drueckten die geprueften Angaben daneben aus dem Bild.
 * Auf der Karte steht deshalb nur noch der Anfang; wer es genau wissen will,
 * klappt auf.
 */

/** So viele Woerter bleiben stehen, bevor gekuerzt wird. */
export const FACT_PREVIEW_WORDS = 5;

export type FactPreview = {
  /** Der gekuerzte Anfang, mit Auslassungszeichen wenn etwas fehlt. */
  preview: string;
  /** Der vollstaendige Text. */
  full: string;
  /** Gibt es ueberhaupt etwas aufzuklappen? */
  truncated: boolean;
};

/**
 * Kuerzt nach Woertern, nicht nach Zeichen: eine Zeichengrenze schneidet
 * mitten im Wort und liest sich wie ein Uebertragungsfehler.
 */
export function factPreview(facts: readonly string[], words = FACT_PREVIEW_WORDS): FactPreview {
  const full = facts.join(" · ").trim();
  if (!full) return { preview: "", full: "", truncated: false };

  const parts = full.split(/\s+/);
  if (parts.length <= words) return { preview: full, full, truncated: false };

  return {
    preview: `${parts.slice(0, words).join(" ")} …`,
    full,
    truncated: true,
  };
}
