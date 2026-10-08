import { TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/billing/plans";
export type FaqPart = string | { href: string; label: string };
export type FaqItem = { question: string; answer: readonly FaqPart[] };
export function landingFaq(): readonly FaqItem[] {
  return [
    { question: "Kann ich ohne Karte ausprobieren?", answer: ["Sie können das klar gekennzeichnete Ergebnisbeispiel ohne Konto und Karte ansehen. Der eigentliche Trial startet erst nach bestätigter E-Mail und serverseitig verifizierter Kartenhinterlegung bei Stripe."] },
    { question: "Was enthält der kostenlose Trial?", answer: [`${TRIAL_DAYS} Tage Zugang im gewählten Tarif mit einmalig ${TRIAL_CREDITS} Credits insgesamt. Danach beginnt das gewählte Monatsabonnement, sofern Sie vor dem bestätigten Trial-Ende nicht kündigen. Preise und Kartenpflicht sehen Sie vor dem Start auf der `, { href: "/preise", label: "Preisseite" }, "."] },
    { question: "Gibt es eine Vermittlungsgebühr?", answer: ["Für neue Vorgänge nicht. Sie bezahlen die Software-Nutzung. Neue Kontaktanfragen und Beauftragungen lösen keine Provision oder Erfolgsgebühr aus. Bestehende historische Verträge bleiben unverändert."] },
    { question: "Ist ein passender Freelancer garantiert?", answer: ["Nein. Ergebnisse hängen von Anforderungen und Profilangaben ab. Unbekannte Angaben bleiben offen. Ein Profilfund bestätigt weder Interesse noch Verfügbarkeit; diese entscheidet der Freelancer selbst."] },
    { question: "Wie geht es nach einem Ergebnis weiter?", answer: ["Speichern und vergleichen Sie Ihre Auswahl. Freigegebene Dokumente und Kontaktwege nutzen Sie entsprechend ihrer Freigabe; andernfalls lösen Sie bewusst eine Kontaktanfrage aus. Der Freelancer entscheidet selbst. Ein Gespräch mit dem Betreiber ist keine Voraussetzung."] },
  ];
}
export function faqAnswerText(item: FaqItem): string { return item.answer.map((part) => typeof part === "string" ? part : part.label).join(""); }
