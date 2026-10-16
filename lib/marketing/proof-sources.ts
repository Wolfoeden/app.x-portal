/**
 * Belege für die Startseite und die Praxisseite: Unternehmen, deren
 * Veröffentlichungen die Thesen aus Roman Derings Studienarbeiten stützen
 * (Telefonleitfaden: „belegt von Firmen wie Lufthansa und …“). Jeder Name
 * verlinkt die Quelle selbst; XPORTAL nennt sie nicht als Kunden.
 *
 * IBM ohne die Tracking-Parameter der Google-Anzeige, aus der der Link
 * stammte. Lufthansa: die Downloadseite von Lufthansa Industry Solutions für
 * das Whitepaper „Agentic AI“ (agentic-ai-wp-lhind.pdf, Mai 2025), nicht eine
 * eigene Kopie des PDFs.
 */
export const PROOF_SOURCES = [
  { name: "IBM", href: "https://www.ibm.com/de-de/solutions/ai-agents", title: "IBM: KI-Agenten-Lösungen" },
  {
    name: "Lufthansa",
    href: "https://www.lufthansa-industry-solutions.com/de-de/studien/whitepaper-agentic-ai-2025",
    title: "Lufthansa Industry Solutions: Whitepaper „Agentic AI“",
  },
  { name: "Vodafone", href: "https://n8n.io/case-studies/vodafone/", title: "Vodafone UK: Fallstudie von n8n" },
] as const;

export type ProofSource = (typeof PROOF_SOURCES)[number];

export function proofSource(name: ProofSource["name"]): ProofSource {
  return PROOF_SOURCES.find((source) => source.name === name)!;
}
