import { BRIEF_ANALYSIS_CREDITS } from "@/lib/ai/credit-policy";
import { CREDIT_RULES } from "@/lib/billing/credit-rules";
import {
  formatWholeEuro,
  PLACEMENT_EXAMPLE,
  PLACEMENT_TERMS,
  PLACEMENT_TERMS_PATH,
  placementExampleFeeCents,
} from "@/lib/placement/config";
import { MARKETING_PAGE } from "@/lib/seo";

/** Ein Stück Antwort: Text oder ein Link mit seinem sichtbaren Wortlaut. */
export type FaqPart = string | { href: string; label: string };

export type FaqItem = { question: string; answer: readonly FaqPart[] };

/**
 * Die Fragen am Ende der Startseite. Als Daten statt als JSX, weil dieselben
 * Sätze auch als strukturierte Daten (FAQPage) ausgegeben werden; so kann die
 * Fassung für Suchmaschinen nicht von der sichtbaren abweichen.
 */
export function landingFaq(placement: boolean): readonly FaqItem[] {
  const t = PLACEMENT_TERMS;
  return [
    {
      question: "Kann ich ohne Anmeldung starten?",
      answer: ["Ja. Beschreiben Sie Ihr Projekt als Gast. Für das dauerhafte Speichern und weitere Schritte mit einem ausgewählten Profil können Sie anschließend ein Konto erstellen."],
    },
    {
      question: "Was kostet die Suche?",
      answer: [
        `${CREDIT_RULES.guest} ${CREDIT_RULES.account} Eine Projektanalyse verbraucht ${BRIEF_ANALYSIS_CREDITS} Credits; fällt die KI aus, nichts. Kontingente und weitere Aktionen finden Sie auf der `,
        { href: MARKETING_PAGE.pricing.path, label: "Preisseite" },
        ". Freelancer-Honorare sind separat.",
      ],
    },
    {
      question: "Ist ein passender Freelancer garantiert?",
      answer: ["Nein. Ergebnisse hängen von Ihren Anforderungen und den vorhandenen Profilen ab. Profilangaben sind nicht automatisch unabhängig geprüft. Verfügbarkeit, Honorar und offene Fragen klären Sie vor einer Zusammenarbeit. Auch kein passendes Ergebnis wird ausgewiesen."],
    },
    placement
      ? {
          question: "Was kostet die Vermittlung?",
          answer: [
            `Anfrage, Vorstellung und Erstgespräch sind kostenlos; für die Suche im Chat gilt das Startguthaben. Beauftragen Sie den Freelancer, zahlen Sie einmalig ${t.feePercent} % des vereinbarten Honorars für die ersten ${t.feeMonths} Monate (höchstens ${t.maxFeeDays} Projekttage), zuzüglich Umsatzsteuer, per Rechnung mit ${t.paymentDays} Tagen Zahlungsziel. Beispiel: ${formatWholeEuro(PLACEMENT_EXAMPLE.dayRateCents)} Tagessatz und ${PLACEMENT_EXAMPLE.projectDays} Projekttage ergeben ${formatWholeEuro(placementExampleFeeCents())} netto. Die Rechnung kommt erst nach der Beauftragung, nicht für einen gebuchten Termin. Einzelheiten stehen in den `,
            { href: PLACEMENT_TERMS_PATH, label: "Vermittlungsbedingungen" },
            ".",
          ],
        }
      : {
          question: "Was bedeutet „direkt buchen“?",
          answer: ["Nach der Anmeldung öffnen Sie bei einem Profil mit Terminlink den hinterlegten Buchungskalender und wählen selbst einen freien Slot. Ohne Terminlink ist die direkte Buchung derzeit nicht verfügbar. Der Termin ist ein Erstgespräch und noch keine Beauftragung."],
        },
    {
      question: "Wie läuft das Gespräch ab?",
      answer: ["Sie erzählen in 30 Minuten, wen Sie suchen; wir sagen Ihnen ehrlich, ob unser Bestand passt, und stellen passende Freelancer danach per E-Mail vor. Das Gespräch ist kostenlos und verpflichtet zu nichts."],
    },
  ];
}

/** Die Antwort als reiner Text, wie sie ein Leser ohne Links sieht. */
export function faqAnswerText(item: FaqItem): string {
  return item.answer.map((part) => (typeof part === "string" ? part : part.label)).join("");
}
