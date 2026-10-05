import { PROVIDER_ADDRESS } from "@/lib/legal/policy";
import { PLACEMENT_TERMS, placementRequestsEnabled } from "@/lib/placement/config";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";
import { LLMS_DATA_FACTS } from "@/lib/marketing/llms-facts";
import { CHAT_PAGE, MARKETING_PAGES, absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  const pages = [CHAT_PAGE, ...MARKETING_PAGES];
  const placement = placementRequestsEnabled();
  const t = PLACEMENT_TERMS;
  const text = [
    "# XPORTAL",
    "",
    "> Freelancer finden für Recruiter, Personaldienstleister und Unternehmen – mit nachvollziehbarer Match-Begründung. Anbieter mit Sitz in Deutschland.",
    "",
    "XPORTAL unterstützt Unternehmen bei der Suche nach Freelancern. KI strukturiert Projektangaben. Der interne Profilabgleich erfolgt regelbasiert anhand vorhandener Informationen. Match-Gründe und Informationslücken unterstützen die Auswahl durch den Nutzer; eine Beauftragung erfolgt nicht automatisch.",
    "",
    "Diese Übersicht ist ein optionales Leseangebot für Systeme, die llms.txt unterstützen. Sie ersetzt weder die Website noch robots.txt und ist kein Rankingversprechen.",
    "",
    "## Für wen",
    "- Recruiter und Personaldienstleister, die Kundenanfragen mit Freelancern besetzen.",
    "- Unternehmen mit eigenem Bedarf an Freelancern für KI-, Software-, SAP- und Digitalprojekte.",
    "- Geschäftskunden in Deutschland, Österreich, der Schweiz und der übrigen EU; Sprache der Website und der Zusammenarbeit ist Deutsch.",
    "",
    "## Leistungen",
    "- Freelancer finden: Eine Projekt- oder Kundenanfrage wird mit freigegebenen Freelancer-Profilen abgeglichen. Zu den Vorschlägen stehen Belege, Honorarangaben und offene Punkte.",
    "- Freelancer für KI-Agenten (AI Agents) finden: Entwicklerinnen und Entwickler für Agenten auf Basis von Sprachmodellen, angebunden an die Systeme und Daten des Kunden, etwa mit RAG und Freigabeschritten. Auf der Startseite ist das die Rolle „AI-Agent-Entwickler finden“.",
    "- IT-Freelancer: Softwareentwicklung (z. B. React und TypeScript), SAP und Integration, KI und Automatisierung, Anforderungen und Prozesse.",
    ...(placement
      ? [`- Vermittlung: Gespräch, Anfrage und Vorstellung sind kostenlos. Nur wenn ein vorgestellter Freelancer beauftragt wird, fällt einmalig ${t.feePercent} % des vereinbarten Honorars der ersten ${t.feeMonths} Monate an, höchstens ${t.maxFeeDays} Projekttage, netto. Der Vertrag entsteht direkt zwischen Kunde und Freelancer.`]
      : []),
    "- Selbst suchen: Projektanalysen und Recherchen mit Credits; Startguthaben ohne Abo, danach Monatstarife.",
    "",
    "## KI und AI Agents bei XPORTAL",
    "- Die KI strukturiert die Projektangaben. Welche Profile passen, entscheidet ein regelbasierter Abgleich; Match-Gründe und Lücken sind sichtbar.",
    "- Auswahl und Beauftragung trifft der Mensch. Es gibt keine automatische Auswahl- oder Beauftragungsentscheidung.",
    "- Die externe AI-Agent-Recherche im öffentlichen Web ist vom internen Abgleich getrennt. Sie braucht ein Konto und eine ausdrückliche Bestätigung; ihre Ergebnisse sind als nicht durch XPORTAL verifiziert gekennzeichnet.",
    "",
    "## Datenschutz, EU und Deutschland",
    `- Anbieter: XPORTAL, Inhaber ${SALES_CONTACT.name}, ${PROVIDER_ADDRESS}, Deutschland.`,
    ...LLMS_DATA_FACTS.slice(0, 5).map((fact) => `- ${fact}`),
    `- E-Mails wie Bestätigungen ${LLMS_DATA_FACTS[5]}`,
    `- [Datenwege](${absoluteUrl("/datenwege")}): welcher Schritt wohin geht. Verbindlich ist die [Datenschutzerklärung](${absoluteUrl("/privacy")}).`,
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
