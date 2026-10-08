import { CREDIT_PRICES } from "@/lib/ai/credit-policy";

import { TRIAL_CREDITS, TRIAL_DAYS } from "./plans";

/**
 * Die Credit-Regeln in Sätzen, an einer Stelle.
 *
 * Das Audit vom 30.09.2026 (F02) fand drei Kostenlogiken, die auf Startseite,
 * Preisseite und in den AGB unterschiedlich beschrieben waren: „90
 * Start-Credits“ ohne den Hinweis, dass ein Gast 30 hat, und nichts dazu,
 * was bei der Registrierung mit dem Gastguthaben passiert. Die Sätze hier
 * beschreiben, was die Abrechnung tatsächlich tut
 * (`20260915143000_pricing_billing_v2.sql`: Beim Wechsel vom Gast zum Konto
 * wird das Guthaben auf den Konto-Start gesetzt, nicht addiert). Seiten, die
 * darüber sprechen, übernehmen sie von hier.
 */
export const CREDIT_RULES = {
  guest: "Ohne Karte ist ein gekennzeichnetes Ergebnisbeispiel verfügbar. Neue Gäste erhalten kein Bonusguthaben.",
  account: `Der ${TRIAL_DAYS}-Tage-Trial beginnt nach bestätigter E-Mail und serverseitig verifizierter Kartenhinterlegung bei Stripe mit einmalig ${TRIAL_CREDITS} Credits insgesamt. Neue Registrierung erzeugt kein zusätzliches Bonusguthaben.`,
  noRefill: "Verbrauchte Trial-Credits füllen sich nicht auf und lösen keine vorzeitige Abbuchung aus. Legitim zugesagtes Bestandsguthaben bleibt erhalten.",
  failures: `Fällt die KI-Analyse aus, kostet sie nichts; eine technisch gescheiterte Recherche ebenfalls nicht. Eine Analyse kostet sonst ${CREDIT_PRICES.project_brief.credits} Credits, eine Recherche ${CREDIT_PRICES.research.credits}.`,
  placementWithoutPlan:
    "Neue Kontaktanfragen benötigen einen aktiven Trial oder Tarif und eine ausdrückliche Freigabe. Neue Beauftragungen sind provisionsfrei.",
} as const;
