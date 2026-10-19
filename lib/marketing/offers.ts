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

/**
 * Schulung und ISO 27001 haben noch keinen veröffentlichten Preis (Stand
 * 19.10.2026). Steht einer fest, gehört er hierher, etwa `price: "ab 1.200 €"`;
 * bis dahin zeigt die Startseite „Preis auf Anfrage“.
 */
export const PRICE_ON_REQUEST = "Preis auf Anfrage";

export const TRAINING_OFFER: { name: string; price: string | null } = { name: "KI-Schulung", price: null };

export const ISO_OFFER: { name: string; price: string | null } = { name: "ISO 27001", price: null };
