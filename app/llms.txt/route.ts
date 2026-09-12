import { CHAT_PAGE, MARKETING_PAGES, absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  const pages = [CHAT_PAGE, ...MARKETING_PAGES];
  const text = [
    "# XPORTAL",
    "",
    "> Freelancer für Projekte finden – mit nachvollziehbarer Match-Begründung.",
    "",
    "XPORTAL unterstützt Unternehmen bei der Suche nach Freelancern. KI strukturiert Projektangaben. Der interne Profilabgleich erfolgt regelbasiert anhand vorhandener Informationen. Match-Gründe und Informationslücken unterstützen die Auswahl durch den Nutzer; eine Beauftragung erfolgt nicht automatisch.",
    "",
    "Diese Übersicht ist ein optionales Leseangebot für Systeme, die llms.txt unterstützen. Sie ersetzt weder die Website noch robots.txt und ist kein Rankingversprechen.",
    "",
    "## Produkt und Erklärung",
    ...pages.map((page) => `- [${page.label}](${absoluteUrl(page.path)}): ${page.description}`),
    "",
    "## Anbieter und Kontakt",
    `- [Impressum](${absoluteUrl("/imprint")}): Anbieterangaben.`,
    `- [Kontakt](${absoluteUrl("/contact")}): Kontakt zu XPORTAL.`,
    `- [Datenschutz](${absoluteUrl("/privacy")}): Informationen zur Datenverarbeitung.`,
    "",
  ].join("\n");

  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
