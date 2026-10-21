/**
 * Das Einstiegsangebot für KI-Automatisierung (Vorgabe des Betreibers,
 * 19.10.2026; seit 21.10.2026 ab 490 €): ein klar umrissener Ablauf zum
 * Einstiegspreis, in kurzer Zeit umgesetzt. Weitere Automatisierungen laufen
 * danach auf Stundenbasis, weil das Unternehmen dann bekannt ist.
 * Startseite, Kontaktseite, Vorschaubild, strukturierte Daten und
 * Suchmaschinen-Texte nennen den Preis aus dieser einen Quelle.
 */
export const AUTOMATION_OFFER = {
  name: "KI-Automatisierung",
  fromEuro: 490,
  price: "ab 490 €",
  terms: "Ein Ablauf, in kurzer Zeit umgesetzt. Weitere Automatisierungen danach auf Stundenbasis.",
} as const;

/**
 * Schulung und ISMS haben noch keinen veröffentlichten Preis (Stand
 * 21.10.2026). Steht einer fest, gehört er hierher, etwa `price: "ab 1.200 €"`;
 * bis dahin zeigt die Startseite „Preis auf Anfrage“.
 */
export const PRICE_ON_REQUEST = "Preis auf Anfrage";

export const TRAINING_OFFER: { name: string; price: string | null } = { name: "KI-Schulung", price: null };

/**
 * Ein Informationssicherheits-Managementsystem; ISO 27001 ist die Norm, nach
 * der es zertifiziert wird, also ein Teil davon (Vorgabe des Betreibers,
 * 21.10.2026). Die Seite bleibt unter /contact/iso27001, damit Links und
 * Anzeigen weiter stimmen.
 */
export const ISMS_OFFER: { name: string; price: string | null } = { name: "ISMS", price: null };
