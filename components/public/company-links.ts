/**
 * Was XPORTAL Unternehmen anbietet, in zwei Gruppen: selbst finden (Talent
 * Index, die bestehende Arbeitsfläche) und mit uns umsetzen (KI-Agenten und
 * die Kompetenzen rund um sichere KI). Die zweite Gruppe führt oben auf die
 * Kontaktseite; `?thema=` passt Überschrift und Formular an, statt mitten in
 * die Seite zu springen.
 */
export type CompanyLink = { label: string; href: string; note: string };

export const COMPANY_LINK_GROUPS: readonly { label: string; links: readonly CompanyLink[] }[] = [
  {
    label: "Selbst finden",
    links: [{ label: "Talent Index", href: "/chat", note: "Projekt beschreiben, passende Freelancer sehen" }],
  },
  {
    label: "Mit uns umsetzen",
    links: [
      { label: "KI-Agenten", href: "/contact", note: "Kundenservice, Vertrieb, Daten, Wissen, Lager" },
      { label: "KI-Schulungen", href: "/contact?thema=schulung", note: "Für Teams und Führungskräfte" },
      { label: "Cybersecurity & ISO 27001", href: "/contact?thema=iso27001", note: "Anforderungen, ISMS, Audits" },
    ],
  },
];

export const COMPANY_LINKS: readonly CompanyLink[] = COMPANY_LINK_GROUPS.flatMap((group) => group.links);

export const CONTACT_PATH = "/contact";
