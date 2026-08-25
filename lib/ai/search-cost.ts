/**
 * Was eine Websuche wirklich kostet.
 *
 * Bisher stand in der Oberfläche ein fester Preis von 0,50 €. Der beschreibt,
 * was berechnet wird, nicht was entsteht. Hier wird beides getrennt: eine
 * Schätzung vor dem Lauf und der gemessene Betrag danach.
 *
 * Zwei Posten, und der kleinere ist der, den man erwartet:
 *
 *   Token          — Ø 0,33 Cent, gemessen über sechs Läufe in der Produktion
 *   Suchaufrufe    — 1,00 Cent je Aufruf, laut OpenAI-Preisverzeichnis
 *                    (10 $ je 1.000 Aufrufe, unabhängig von Modell und
 *                    search_context_size)
 *
 * Die Aufrufe machen also den Löwenanteil aus. Wer die Kosten senken will,
 * muss die Zahl der Suchen senken, nicht die Wortzahl.
 */

/** 10 $ je 1.000 Aufrufe. */
export const WEB_SEARCH_CALL_NANO_USD = 10_000_000;

/**
 * Durchschnittliche Token-Kosten eines Recherche-Laufs, gemessen an sechs
 * Läufen in der Produktion (Ø 13.872 Eingabe-, 572 Ausgabe-Token auf
 * gpt-5.4-nano). Nur die Vorab-Schätzung greift darauf zurück; nach dem Lauf
 * werden die echten Token verrechnet.
 */
export const MEASURED_RESEARCH_TOKEN_NANO_USD = 3_320_000;

/** Was ein Lauf typischerweise an Suchen verbraucht. */
export const TYPICAL_SEARCH_TOOL_CALLS = 4;

export type SearchCost = {
  toolCalls: number;
  tokenNanoUsd: number;
  toolNanoUsd: number;
  totalNanoUsd: number;
  /** Auf eine Nachkommastelle gerundet, für die Anzeige. */
  cents: number;
};

function toCents(nanoUsd: number): number {
  return Math.round(nanoUsd / 1e7 * 10) / 10;
}

function build(toolCalls: number, tokenNanoUsd: number): SearchCost {
  const toolNanoUsd = Math.max(0, Math.round(toolCalls)) * WEB_SEARCH_CALL_NANO_USD;
  const total = tokenNanoUsd + toolNanoUsd;
  return {
    toolCalls,
    tokenNanoUsd,
    toolNanoUsd,
    totalNanoUsd: total,
    cents: toCents(total),
  };
}

/** Vor dem Lauf: was er voraussichtlich kosten wird. */
export function estimateSearchCost(
  toolCalls: number = TYPICAL_SEARCH_TOOL_CALLS,
): SearchCost {
  return build(toolCalls, MEASURED_RESEARCH_TOKEN_NANO_USD);
}

/**
 * Nach dem Lauf: was er gekostet hat. Ohne belastbare Token-Angabe des
 * Anbieters wird auf den Messwert zurückgegriffen, damit nie eine zu niedrige
 * Zahl angezeigt wird.
 */
export function actualSearchCost(input: {
  toolCalls: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  inputNanoUsdPerToken?: number;
  cachedInputNanoUsdPerToken?: number;
  outputNanoUsdPerToken?: number;
}): SearchCost {
  const inputTokens = input.inputTokens;
  const outputTokens = input.outputTokens;
  if (
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    (inputTokens ?? 0) < 0 ||
    (outputTokens ?? 0) < 0
  ) {
    return build(input.toolCalls, MEASURED_RESEARCH_TOKEN_NANO_USD);
  }

  const cached = Math.min(
    Math.max(input.cachedInputTokens ?? 0, 0),
    inputTokens ?? 0,
  );
  const uncached = (inputTokens ?? 0) - cached;
  const tokenNanoUsd =
    uncached * (input.inputNanoUsdPerToken ?? 200) +
    cached * (input.cachedInputNanoUsdPerToken ?? 20) +
    (outputTokens ?? 0) * (input.outputNanoUsdPerToken ?? 1_250);

  return build(input.toolCalls, tokenNanoUsd);
}

/** "ca. 4,3 ct" — bewusst als Schätzung lesbar. */
export function formatCostEstimate(cost: SearchCost): string {
  return `ca. ${cost.cents.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ct`;
}

/** "4,3 ct" — für den gemessenen Betrag nach dem Lauf. */
export function formatCostExact(cost: SearchCost): string {
  return `${cost.cents.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ct`;
}
