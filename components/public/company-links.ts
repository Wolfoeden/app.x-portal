/**
 * Die Wege im Kopf und in der Fußzeile der öffentlichen Seiten (Entwurf 3,
 * 16.10.2026). Oben nur vier: Live-Demo, Leistungen und Über uns sind
 * Abschnitte der Startseite, dazu der Talent Index. Seit 19.10.2026 steht dort
 * nicht mehr „Preise“: Die Seite zeigt nur die Software-Tarife, und neben den
 * Leistungen hielten Besucher 9 € für den Preis eines KI-Agenten. Preise,
 * Kontakt und Bewerber-Portal stehen im Telefon-Menü und in der Fußzeile.
 *
 * Die Leistungen mit uns führen auf die Kontaktseite; die Seite je Thema
 * (`/contact/schulung`) passt Überschrift und Formular an.
 */
import { SALES_CALENDAR_HREF, type SalesCallEntry } from "@/lib/sales/sales-call-model";

/** `calendar`: der Link öffnet den Kalender und zählt den Klick mit dieser Herkunft. */
export type ChromeLink = { label: string; href: string; calendar?: SalesCallEntry };

export const CONTACT_PATH = "/contact";

export const MAIN_NAVIGATION: readonly ChromeLink[] = [
  { label: "Live-Demo", href: "/#demo" },
  { label: "Leistungen", href: "/#leistungen" },
  { label: "Talent Index", href: "/fuer-unternehmen" },
  { label: "Über uns", href: "/#ueber" },
];

export const MENU_EXTRA_LINKS: readonly ChromeLink[] = [
  { label: "Preise Talent Index", href: "/preise" },
  { label: "Kontakt", href: CONTACT_PATH },
  { label: "Bewerber-Portal", href: "/bewerber-portal/apply" },
];

export const SERVICE_LINKS: readonly ChromeLink[] = [
  { label: "KI-Agenten", href: CONTACT_PATH },
  { label: "KI-Schulungen", href: `${CONTACT_PATH}/schulung` },
  { label: "ISMS", href: `${CONTACT_PATH}/iso27001` },
  { label: "Talent Index", href: "/fuer-unternehmen" },
];

export const FOOTER_COLUMNS: readonly { label: string; links: readonly ChromeLink[] }[] = [
  { label: "Leistungen", links: SERVICE_LINKS },
  {
    label: "XPORTAL",
    links: [
      { label: "Über uns", href: "/#ueber" },
      { label: "Preise Talent Index", href: "/preise" },
      { label: "Erstgespräch buchen", href: SALES_CALENDAR_HREF, calendar: "footer" },
      { label: "Anmelden", href: "/anmelden" },
    ],
  },
  { label: "Für Freelancer", links: [{ label: "Bewerber-Portal", href: "/bewerber-portal/apply" }] },
];
