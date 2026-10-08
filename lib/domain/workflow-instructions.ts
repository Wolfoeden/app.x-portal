/**
 * Search instructions describe what XPORTAL may do, never evidence a freelancer
 * must supply. Keep the raw request intact; only the factual extraction and
 * matching input omit these clauses. This boundary also covers saved briefs.
 */
export function isWorkflowInstruction(value: string): boolean {
  const text = value.normalize("NFKC").trim();
  // A named obligation of the candidate remains an actual requirement.
  if (/\b(?:freelancer|kandidat(?:in|en)?|bewerber(?:in)?)\s+(?:muss|müssen|soll|sollen|darf|dürfen|benötigt|braucht)\b/iu.test(text)) return false;
  if (/\b(?:externe?\s+recherche|external\s+research|kontaktaufnahme|outreach)\b/iu.test(text) && /\b(?:erlaubt|erlaube|erlauben|gestattet|freigegeben|zulassen|allow(?:ed)?)\b/iu.test(text)) return true;
  if (/\b(?:nur|ausschließlich|ausschliesslich|only)\s+(?:die\s+)?(?:vorhandene[nr]?|bestehende[nr]?|gespeicherte[nr]?|interne[nr]?|existing|internal)\s+(?:profile|kandidaten|profiles)\b/iu.test(text)) return true;
  if (/\b(?:keine?|ohne|nicht|no|without|do not)\s+(?:eine?\s+)?(?:externe?\s+|zusätzliche?\s+|external\s+)?(?:recherche|kontaktaufnahme|kontaktanfragen|anschreiben|kontaktieren|research|outreach|contact)\b/iu.test(text)) return true;
  if (/\b(?:profile|kandidaten|profiles)\s+(?:nur\s+)?(?:abgleichen|vergleichen|filtern|anzeigen|matchen|compare|match)\b/iu.test(text) && /\b(?:bitte|nur|ausschließlich|ausschliesslich|xportal|please|only)\b/iu.test(text)) return true;
  return /\b(?:xportal|das system|die software)\b.{0,80}\b(?:recherchieren|recherche|kontaktieren|abgleichen|anzeigen|suchen|anschreiben)\b/iu.test(text);
}

/** Preserve sentence boundaries and real requirements in mixed instructions. */
export function projectRequirementSource(source: string): string {
  return source
    .split(/\r?\n/u)
    .map((line) => line
      .split(/(?<=[.!?;])\s+(?!js\b)|;\s*|,\s*(?=(?:bitte|nur\s+(?:vorhandene|bestehende)|keine?\s+(?:externe?\s+)?(?:recherche|kontaktaufnahme)|no\s+(?:external\s+)?(?:research|outreach))\b)/iu)
      .filter((clause) => !isWorkflowInstruction(clause))
      .join(" "))
    .join("\n");
}
