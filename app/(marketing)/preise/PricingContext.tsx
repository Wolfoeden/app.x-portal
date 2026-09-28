"use client";

import { useEffect, useSyncExternalStore } from "react";

import { trackFunnelEvent } from "@/components/chat/funnel-events";
import { isPricingReason, type PricingReason } from "@/components/chat/upgrade";
import { CREDIT_PRICES, countLabel, roundedExampleCount } from "@/lib/ai/credit-policy";
import { CREDIT_PLANS } from "@/lib/billing/plans";

import styles from "./pricing.module.css";

/**
 * Ein Satz, warum man gerade hier ist — nur wenn man aus der App kommt.
 *
 * Die Seite bleibt statisch vorgerendert; den Grund liest erst der Browser aus
 * der Adresse. Ohne `?grund=` erscheint nichts, und die Seite ist dieselbe wie
 * für jeden anderen Besucher.
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};
const readReason = (): PricingReason | null => {
  const value = new URLSearchParams(window.location.search).get("grund");
  return isPricingReason(value) ? value : null;
};
const readReasonOnServer = (): PricingReason | null => null;

const recommended = CREDIT_PLANS.pro;

const COPY: Readonly<Record<PricingReason, { title: string; body: string }>> = {
  recherche: {
    title: `Für die ${CREDIT_PRICES.research.label} fehlen Credits.`,
    body: `Eine Recherche kostet ${CREDIT_PRICES.research.credits} Credits. ${recommended.label} enthält ${recommended.monthlyCredits.toLocaleString("de-DE")} Credits im Monat – das reicht für rund ${countLabel(
      roundedExampleCount(recommended.monthlyCredits, "research"),
      "research",
    )}. Ihr Projekt bleibt gespeichert.`,
  },
  guthaben: {
    title: "Ihr Guthaben ist aufgebraucht.",
    body: "Mit einem Monatstarif stehen Projektanalysen und AI-Agent-Recherchen nach der Zahlung wieder zur Verfügung. Ihr Projekt bleibt gespeichert.",
  },
};

export function PricingContext() {
  const reason = useSyncExternalStore(subscribe, readReason, readReasonOnServer);
  // Ein Messpunkt je Aufruf der Seite, mit dem Anlass: „recherche“ und
  // „guthaben“ kommen aus der App, „direkt“ von überall sonst. So zeigt der
  // Trichter, ob die Preisseite von leeren Credits oder aus Neugier kommt.
  useEffect(() => {
    trackFunnelEvent("pricing_viewed", readReason() ?? "direkt");
  }, []);
  if (!reason) return null;
  const copy = COPY[reason];
  return (
    <aside className={styles.context} role="status">
      <div>
        <strong>{copy.title}</strong>
        <p>{copy.body}</p>
      </div>
      <a href="/chat">Zurück zum Projekt</a>
    </aside>
  );
}
