/**
 * Was XPORTAL Unternehmen anbietet, in der Reihenfolge des Menüs. Talent Index
 * ist die bestehende Arbeitsfläche; Compliance Check und KI-Webinar laufen
 * über das Kontaktformular, mit vorausgefülltem Betreff.
 */
export const COMPANY_LINKS = [
  { label: "Talent Index", href: "/chat" },
  { label: "Compliance Check", href: "/contact?betreff=Compliance%20Check" },
  { label: "KI-Webinar", href: "/contact?betreff=KI-Webinar" },
] as const;
