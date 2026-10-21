import { CREDIT_PRICES } from "@/lib/ai/credit-policy";

import { CREDIT_PLANS, TRIAL_CREDITS, TRIAL_DAYS } from "./plans";

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
  // Seit 21.10.2026 (Migration 20261021150000): eine Analyse ohne Konto; wer
  // sich danach registriert, behält die drei Starter-Analysen.
  guest: "Ohne Konto ist eine Projektanalyse kostenlos. Für weitere Analysen genügt ein kostenloses Konto; die Gastanalyse wird nicht angerechnet.",
  account: `Ein bestätigtes Konto erhält einmalig ${CREDIT_PLANS.starter.grantCredits} Starter-Credits für drei Projektanalysen. Der ${TRIAL_DAYS}-Tage-Trial beginnt nach serverseitig verifizierter Kartenhinterlegung bei Stripe mit zusätzlich einmalig ${TRIAL_CREDITS} Credits insgesamt.`,
  noRefill: "Verbrauchte Trial-Credits füllen sich nicht auf und lösen keine vorzeitige Abbuchung aus. Legitim zugesagtes Bestandsguthaben bleibt erhalten.",
  failures: `Fällt die KI-Analyse aus, kostet sie nichts; eine technisch gescheiterte Recherche ebenfalls nicht. Eine Analyse kostet sonst ${CREDIT_PRICES.project_brief.credits} Credits, eine Recherche ${CREDIT_PRICES.research.credits}.`,
  placementWithoutPlan:
    "Neue Kontaktanfragen benötigen einen aktiven Trial oder Tarif und eine ausdrückliche Freigabe. Neue Beauftragungen sind provisionsfrei.",
} as const;
