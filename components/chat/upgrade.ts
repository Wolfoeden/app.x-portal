import {
  CREDIT_PRICES,
  affordableCount,
  countLabel,
  creditPlan,
} from "@/lib/ai/credit-policy";
import { PUBLIC_PRICING_PLANS, START_CREDITS } from "@/lib/billing/plans";

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

/** „10 AI-Agent-Recherchen oder 100 Analysen" — in Leistungen, nicht in Credits. */
export function startCreditOutcome(): string {
  return `${countLabel(affordableCount(START_CREDITS, "research"), "research")} oder ${countLabel(
    affordableCount(START_CREDITS, "project_brief"),
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
 * Drei Lagen, drei verschiedene Wahrheiten. Vorher bekam ein Gast „300
 * Credits im Monat" versprochen, obwohl das Startguthaben einmalig ist, und
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
      text: `Ihr Gastguthaben ist aufgebraucht. Mit einem kostenlosen Konto erhalten Sie einmalig ${START_CREDITS} Start-Credits – genug für ${startCreditOutcome()}. Ihre bisherigen Anfragen werden übernommen.`,
      action: { kind: "signup", label: "Kostenloses Konto erstellen" },
    };
  }

  const plan = creditPlan(usage.credits.planId);
  const keepWriting =
    "Sie können weiter schreiben; XPORTAL speichert und gleicht Ihre Angaben regelbasiert ab.";

  if (plan.billingModel === "fixed_monthly") {
    const refill = formatDate(usage.credits.periodEnd);
    return {
      text: `Ihr Monatsguthaben ist aufgebraucht. ${keepWriting} Neues Guthaben gibt es ${
        refill ? `ab ${refill}` : "zu Beginn des nächsten Abrechnungszeitraums"
      }; ein größerer Tarif gilt sofort.`,
      action: { kind: "pricing", label: "Größeren Tarif ansehen" },
    };
  }

  return {
    text: `Ihre Start-Credits sind aufgebraucht und füllen sich nicht wieder auf. ${keepWriting} Für KI-Analysen und ${CREDIT_PRICES.research.plural} gibt es Monatstarife ab ${entryMonthlyEuro()} € netto.`,
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
