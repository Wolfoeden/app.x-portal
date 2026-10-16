/**
 * Die Wege im Kopf und in der Fußzeile der öffentlichen Seiten (Entwurf 3,
 * 16.10.2026). Oben nur vier: Live-Demo, Leistungen und Über uns sind
 * Abschnitte der Startseite, dazu die Preise. Talent Index, Kontakt und
 * Bewerber-Portal stehen im Telefon-Menü und in der Fußzeile.
 *
 * Die Leistungen mit uns führen auf die Kontaktseite; `?thema=` passt dort
 * Überschrift und Formular an.
 */
import { SALES_CALENDAR_PATH } from "@/lib/sales/sales-call-links";

export type ChromeLink = { label: string; href: string };

export const CONTACT_PATH = "/contact";

export const MAIN_NAVIGATION: readonly ChromeLink[] = [
  { label: "Live-Demo", href: "/#demo" },
  { label: "Leistungen", href: "/#leistungen" },
  { label: "Preise", href: "/preise" },
  { label: "Über uns", href: "/#ueber" },
];

export const MENU_EXTRA_LINKS: readonly ChromeLink[] = [
  { label: "Talent Index", href: "/fuer-unternehmen" },
  { label: "Kontakt", href: CONTACT_PATH },
  { label: "Bewerber-Portal", href: "/bewerber-portal/apply" },
];

export const SERVICE_LINKS: readonly ChromeLink[] = [
  { label: "KI-Agenten", href: CONTACT_PATH },
  { label: "KI-Schulungen", href: `${CONTACT_PATH}?thema=schulung` },
  { label: "Informationssicherheit", href: `${CONTACT_PATH}?thema=iso27001` },
  { label: "Talent Index", href: "/fuer-unternehmen" },
];

export const FOOTER_COLUMNS: readonly { label: string; links: readonly ChromeLink[] }[] = [
  { label: "Leistungen", links: SERVICE_LINKS },
  {
    label: "XPORTAL",
    links: [
      { label: "Über uns", href: "/#ueber" },
      { label: "Preise", href: "/preise" },
      { label: "Erstgespräch buchen", href: `${SALES_CALENDAR_PATH}?von=footer` },
      { label: "Anmelden", href: "/anmelden" },
    ],
  },
  { label: "Für Freelancer", links: [{ label: "Bewerber-Portal", href: "/bewerber-portal/apply" }] },
];
