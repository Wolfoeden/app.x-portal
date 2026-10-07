import {
  CREDIT_PRICES,
  affordableCount,
  countLabel,
  creditPlan,
} from "@/lib/ai/credit-policy";
import { PUBLIC_PRICING_PLANS, TRIAL_CREDITS } from "@/lib/billing/plans";

import type { AiUsageSnapshot } from "../chat-contract";

/**
 * Der Weg zum Bezahlen, von dort aus, wo das Guthaben nicht mehr reicht.
 *
 * Die Preisliste steht an genau einer Stelle, auf /preise. Die Oberfläche
 * nennt deshalb keine Tarifkarten, sondern schickt mit einem Grund dorthin —
 * die Preisseite sagt dann in einem Satz, warum man gerade da ist, und führt
 * zurück ins Projekt. Ohne den Grund stand ein Nutzer mitten in der Recherche
 * plötzlich auf einer Marketingseite und musste selbst herausfinden, welcher
 * Tarif sein Problem löst.
 */
export type PricingReason = "recherche" | "guthaben";

export const PRICING_REASONS: readonly PricingReason[] = ["recherche", "guthaben"];

export function isPricingReason(value: unknown): value is PricingReason {
  return typeof value === "string" && (PRICING_REASONS as readonly string[]).includes(value);
}

export function pricingPath(reason: PricingReason): string {
  return `/preise?grund=${reason}`;
}

/** Der günstigste buchbare Monatstarif — der Einstieg, den jeder Hinweis nennt. */
export function entryMonthlyEuro(): number {
  return Math.min(
    ...PUBLIC_PRICING_PLANS.flatMap((plan) =>
      plan.billingModel === "fixed_monthly" ? [plan.euro] : [],
    ),
  );
}

/** „3 AI-Agent-Recherchen oder 30 Analysen" — in Leistungen, nicht in Credits. */
export function startCreditOutcome(): string {
  return `${countLabel(affordableCount(TRIAL_CREDITS, "research"), "research")} oder ${countLabel(
    affordableCount(TRIAL_CREDITS, "project_brief"),
    "project_brief",
  )}`;
}

export type ExhaustedNotice = {
  text: string;
  action: { kind: "signup" | "pricing"; label: string } | null;
};

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Was unter dem Eingabefeld steht, wenn das Guthaben aufgebraucht ist.
 *
 * Drei Lagen, drei verschiedene Wahrheiten. Vorher bekam ein Gast das
 * Startguthaben „im Monat" versprochen, obwohl das Startguthaben einmalig ist, und
 * ein Konto im kostenlosen Start las „Neues Guthaben gibt es ab …" — für ein
 * Guthaben, das sich nie wieder auffüllt. Beides führte ins Leere: der eine
 * erwartete eine Auffüllung, die nicht kommt, der andere sah keinen Weg weiter.
 */
export function exhaustedNotice(
  usage: AiUsageSnapshot,
  isAccountUser: boolean,
): ExhaustedNotice {
  if (!isAccountUser) {
    return {
      text: `Für neue KI-Läufe benötigen Sie ein bestätigtes Konto und einen aktiven Trial oder Tarif. Der 14-Tage-Trial enthält einmalig ${TRIAL_CREDITS} Credits insgesamt und erfordert eine Karte bei Stripe. Ihre Eingabe bleibt erhalten. Ein Ergebnisbeispiel können Sie ohne Karte ansehen.`,
      action: { kind: "pricing", label: "14 Tage kostenlos testen" },
    };
  }

  const plan = creditPlan(usage.credits.planId);
  const keepWriting =
    "Ihre gespeicherten Projekte bleiben lesbar. Ihren noch nicht gesendeten Text bewahren wir in diesem Browser auf.";

  if (usage.credits.subscriptionStatus === "trialing") {
    return { text: `Ihre Trial-Credits sind aufgebraucht. Sie werden nicht aufgefüllt und lösen keine vorzeitige Abbuchung aus. ${keepWriting} Das bestätigte Trial-Ende und die Kündigung finden Sie in Ihrem Konto.`, action: null };
  }
  if (["past_due", "unpaid", "incomplete", "canceled", "incomplete_expired", "paused"].includes(usage.credits.subscriptionStatus ?? "")) {
    return { text: `Derzeit sind keine neuen kostenpflichtigen KI-Läufe freigeschaltet. ${keepWriting} Prüfen Sie die Abrechnung und aktualisieren Sie bei offener Zahlung Ihr Zahlungsmittel.`, action: null };
  }

  if (plan.billingModel === "fixed_monthly") {
    const refill = formatDate(usage.credits.periodEnd);
    return {
      text: `Ihr Monatsguthaben ist aufgebraucht. ${keepWriting} Neues Guthaben gibt es ${
        refill ? `nach bestätigter Zahlung für die Periode ab ${refill}` : "nach bestätigter Zahlung der nächsten Abrechnungsperiode"
      }.`,
      action: { kind: "pricing", label: "Größeren Tarif ansehen" },
    };
  }

  return {
    text: `Ihr verfügbares Guthaben ist aufgebraucht. Ein neues Konto erzeugt kein Bonusguthaben. ${keepWriting} Für KI-Analysen und ${CREDIT_PRICES.research.plural} gibt es Monatstarife ab ${entryMonthlyEuro()} € netto und, sofern berechtigt, einen 14-Tage-Trial mit Karte.`,
    action: { kind: "pricing", label: "Tarife ansehen" },
  };
}

/**
 * Ob das Konto eine laufende Abrechnung hat, die sich verwalten lässt.
 *
 * Nur dann führt „Abrechnung und Team" in die Verwaltung (Kundenportal, Team,
 * eigenes Limit). Wer noch im kostenlosen Start ist, hat dort nichts zu
 * verwalten und landet direkt bei den Tarifen.
 */
export function hasManagedBilling(usage: AiUsageSnapshot | null): boolean {
  if (!usage) return false;
  const plan = creditPlan(usage.credits.planId);
  return plan.billingModel !== "one_time" || Boolean(usage.credits.subscriptionStatus);
}
