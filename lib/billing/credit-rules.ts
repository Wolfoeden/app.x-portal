import { CREDIT_PRICES } from "@/lib/ai/credit-policy";

import { GUEST_TRIAL_CREDITS, START_CREDITS } from "./plans";

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
  guest: `Ohne Konto: ${GUEST_TRIAL_CREDITS} Credits, einmalig.`,
  account: `Mit kostenlosem Konto: ${START_CREDITS} Credits insgesamt, einmalig. Das Gastguthaben wird dabei ersetzt, nicht addiert.`,
  noRefill: "Das Startguthaben füllt sich nicht monatlich auf.",
  failures: `Fällt die KI-Analyse aus, kostet sie nichts; eine technisch gescheiterte Recherche ebenfalls nicht. Eine Analyse kostet sonst ${CREDIT_PRICES.project_brief.credits} Credits, eine Recherche ${CREDIT_PRICES.research.credits}.`,
  placementWithoutPlan:
    "Anfrage und Vorstellung sind kostenlos und brauchen kein Abo. Ein Monatstarif lohnt sich, wenn Sie regelmäßig Projekte analysieren oder recherchieren.",
} as const;
