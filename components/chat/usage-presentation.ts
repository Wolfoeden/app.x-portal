import {
  affordableCount,
  countLabel,
} from "@/lib/ai/credit-policy";

import type { AiUsageSnapshot, CreditBalanceSnapshot } from "../chat-contract";
import { formatCredits } from "./shared";

export function estimatedRequestsLeft(credits: CreditBalanceSnapshot): number {
  if (credits.creditsPerRequest <= 0) return 0;
  return Math.floor(credits.remaining / credits.creditsPerRequest);
}

export function usageSummary(
  usage: AiUsageSnapshot,
  authenticated: boolean,
): string {
  const left = estimatedRequestsLeft(usage.credits);
  const balance = `Guthaben: ${formatCredits(usage.credits.remaining)} Credits · ${formatCredits(left)} ${
    left === 1 ? "Anfrage" : "Anfragen"
  }`;
  const searches = affordableCount(usage.credits.remaining, "research");
  return authenticated
    ? `${balance} · ${countLabel(searches, "research")}`
    : balance;
}

export function publicProgressLabel(label: string): string {
  const normalized = label.toLocaleLowerCase("de-DE");
  if (normalized.includes("speicher")) return "Anfrage wird gespeichert";
  if (normalized.includes("teiltreffer")) {
    return "Teiltreffer und offene Muss-Kriterien werden aufbereitet";
  }
  if (normalized.includes("kein") && normalized.includes("treffer")) {
    return "Interner Profilabgleich abgeschlossen · kein passendes Profil gefunden";
  }
  if (normalized.includes("profil") || normalized.includes("abgleich")) {
    if (normalized.includes("aufbereit") || normalized.includes("vorbereit")) {
      return "Passende Profile werden nach belegter Passung priorisiert";
    }
    return "Profile werden nach belegten Kriterien geprüft";
  }
  if (normalized.includes("struktur") || normalized.includes("analys")) {
    return "Projektanforderungen werden strukturiert";
  }
  return "Anfrage wird verarbeitet";
}
