import { AUTOMATION_OFFER, ISMS_OFFER, PRICE_ON_REQUEST, TRAINING_OFFER } from "./offers";

export type HomeService = {
  title: string;
  text: string;
  /** Was in der Preisspalte steht. */
  price: string;
  /** Der Einstiegspreis in Euro, wenn es einen gibt (für die strukturierten Daten). */
  fromEuro: number | null;
  href: `/${string}`;
  highlight: boolean;
  /** Für Suchmaschinen: ein Satz, der die Leistung ohne Seitenkontext beschreibt. */
  schemaDescription: string | null;
};

/**
 * Die Leistungen der Startseite, in dieser Reihenfolge. Dieselbe Liste speist
 * die Preisliste und die strukturierten Daten (lib/structured-data.ts), damit
 * Google und Besucher dieselben Namen und Preise sehen. Der Talent Index ist
 * Software und steht als solche auf /fuer-unternehmen, deshalb ohne
 * `schemaDescription`.
 */
export const HOME_SERVICES: readonly HomeService[] = [
  {
    title: AUTOMATION_OFFER.name,
    text: "Ein Ablauf automatisiert, zum Beispiel Anfragen vorsortieren oder Angebote vorbereiten. Kurzes Zeitfenster bis zur Abgabe, weitere Abläufe auf Stundenbasis.",
    price: AUTOMATION_OFFER.price,
    fromEuro: AUTOMATION_OFFER.fromEuro,
    href: "/contact",
    highlight: true,
    schemaDescription: `KI-Agenten für den Mittelstand: ein Ablauf wie Anfragen vorsortieren, Angebote vorbereiten oder Auswertungen erstellen, ${AUTOMATION_OFFER.price}. ${AUTOMATION_OFFER.terms}`,
  },
  {
    title: TRAINING_OFFER.name,
    text: "Seit Februar 2025 Pflicht (EU AI Act, Art. 4). Halbtags, vor Ort oder online, mit Teilnahmebestätigung.",
    price: TRAINING_OFFER.price ?? PRICE_ON_REQUEST,
    fromEuro: null,
    href: "/contact/schulung",
    highlight: false,
    schemaDescription: "KI-Schulungen für Teams und Führungskräfte nach Art. 4 EU AI Act (KI-Kompetenz), halbtags, vor Ort oder online, mit Teilnahmebestätigung.",
  },
  {
    title: ISMS_OFFER.name,
    text: "Informationssicherheits-Managementsystem aufbauen, mit Zertifizierung nach ISO 27001, begleitet von der Bestandsaufnahme bis zum Audit.",
    price: ISMS_OFFER.price ?? PRICE_ON_REQUEST,
    fromEuro: null,
    href: "/contact/iso27001",
    highlight: false,
    schemaDescription: "ISMS (Informationssicherheits-Managementsystem) aufbauen und die Zertifizierung nach ISO 27001 vorbereiten, begleitet bis zum Audit; auch für Anforderungen aus NIS2 und Kundenverträgen.",
  },
  {
    title: "Talent Index",
    text: "Geprüfte IT- und KI-Experten, wenn Ihnen Leute fehlen. Projekt beschreiben, passende Profile mit Begründung sehen.",
    price: "kostenlos testen",
    fromEuro: null,
    href: "/fuer-unternehmen",
    highlight: false,
    schemaDescription: null,
  },
];
