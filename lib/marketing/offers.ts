/**
 * Das Einstiegsangebot für KI-Automatisierung (Vorgabe des Betreibers,
 * 19.10.2026): ein klar umrissener Ablauf zum Einstiegspreis, in kurzer Zeit
 * umgesetzt. Weitere Automatisierungen laufen danach auf Stundenbasis, weil
 * das Unternehmen dann bekannt ist. Startseite, Kontaktseite und
 * Suchmaschinen-Texte nennen den Preis aus dieser einen Quelle.
 */
export const AUTOMATION_OFFER = {
  name: "KI-Automatisierung",
  fromEuro: 1900,
  price: "ab 1.900 €",
  terms: "Ein Ablauf, in kurzer Zeit umgesetzt. Weitere Automatisierungen danach auf Stundenbasis.",
} as const;
