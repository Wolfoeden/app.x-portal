import {
  normalizeAiTokenUsage,
  resolveMeteredModel,
  type AiModelIdentity,
  type AiTokenUsage,
} from "@/lib/ai/model-pricing";

/**
 * Token-weighted metering for the customer-facing balance. Jede Anfrage wird
 * nach dieser Politik gegen `user_ai_credit_accounts` abgerechnet — es gibt
 * nur dieses eine Konto.
 *
 * Bis September 2026 lief die Websuche über ein zweites Guthaben
 * (`product_credit_accounts`) mit eigener Währung. Zwei Zahlen in derselben
 * Oberfläche, beide „Credits" genannt, waren für niemanden durchschaubar: der
 * Kunde konnte nicht sehen, welche für welche Funktion gilt, und jede weitere
 * kostenpflichtige Funktion hätte die Frage neu aufgeworfen, aus welchem der
 * beiden Töpfe sie bezahlt wird. Seit dem Zusammenlegen ist eine Funktion
 * nichts weiter als ein Eintrag in CREDIT_PRICES gegen dasselbe Guthaben.
 */
export type AiCreditPolicy = {
  version: string;
  unitLabel: "XPORTAL_AI_CREDIT";
  weightedUnitsPerCredit: number;
  tokenWeights: {
    uncachedInput: number;
    cachedInput: number;
    output: number;
  };
  defaultPurposeMultiplierBasisPoints: number;
  purposeMultiplierBasisPoints: Readonly<Record<string, number>>;
  defaultModelMultiplierBasisPoints: number;
  modelMultiplierBasisPoints: Readonly<Record<string, number>>;
  /**
   * Purposes sold at a fixed price. A purpose listed here ignores the token
   * weighting entirely: a two-line brief and a two-page one cost the same.
   * The weighted units are still computed and reported, so a settlement stays
   * auditable against the metering the flat price replaced.
   */
  flatPriceCredits: Readonly<Record<string, number>>;
};

export const XPORTAL_AI_CREDIT_POLICY_VERSION =
  "xportal-ai-credits-2026-09-01-v6";

/**
 * Die Preisliste. Eine Zeile je kostenpflichtiger Funktion, und zwar die
 * einzige Stelle, an der ihr Preis steht.
 *
 * Feste Preise, keine Messung: wer auf den Knopf drückt, hat vorher die Zahl
 * gelesen, und die muss stimmen — ob die Anfrage eine Zeile lang ist oder
 * zwanzig. Die Tokenmessung läuft weiter mit und wird protokolliert, damit
 * eine Abrechnung gegen die abgelöste Messung prüfbar bleibt.
 *
 * `singular` und `plural` sind da, damit die Oberfläche in Leistungen zählen
 * kann statt in Einheiten: „reicht für 9 Recherchen" sagt einem Kunden etwas,
 * „290 Credits" nicht. Eine neue Funktion braucht hier einen Eintrag und
 * sonst nichts — kein zweites Kontingent, kein eigener Zähler.
 */
export const CREDIT_PRICES = {
  project_brief: {
    credits: 3,
    label: "Projektanalyse",
    singular: "Analyse",
    plural: "Analysen",
  },
  research: {
    credits: 30,
    label: "Websuche nach Freelancern",
    singular: "Recherche",
    plural: "Recherchen",
  },
} as const;

export type CreditPriceId = keyof typeof CREDIT_PRICES;

export const BRIEF_ANALYSIS_CREDITS = CREDIT_PRICES.project_brief.credits;
export const EXTERNAL_SEARCH_CREDITS = CREDIT_PRICES.research.credits;

/**
 * Wie oft ein Guthaben für diese Funktion noch reicht. Abgerundet, denn eine
 * halbe Recherche gibt es nicht.
 */
export function affordableCount(
  remainingCredits: number,
  id: CreditPriceId,
): number {
  const price = CREDIT_PRICES[id].credits;
  if (!Number.isFinite(remainingCredits) || remainingCredits <= 0) return 0;
  return Math.floor(remainingCredits / price);
}

/** „1 Recherche" / „9 Recherchen" — die Zählweise, die die Oberfläche zeigt. */
export function countLabel(count: number, id: CreditPriceId): string {
  const price = CREDIT_PRICES[id];
  return `${count} ${count === 1 ? price.singular : price.plural}`;
}

/**
 * Die Stufen. Jede Stufe ist ein monatliches Kontingent, das sich zum
 * Monatswechsel wieder auffüllt — auch die gekaufte. Ein Plan hebt also die
 * wiederkehrende Zahl, er legt kein zweites Guthaben daneben.
 *
 * Das Kontingent trägt alles: Analyse, Websuche und jede weitere Funktion aus
 * CREDIT_PRICES. Enterprise sind 3.000 Credits für 50 € netto — bei 30
 * Credits je Websuche also bis zu 100 Recherchen im Monat, wenn sonst nichts
 * abgeht.
 *
 * `agents` ist die einzige Fähigkeit, die nicht am Guthaben hängt: ein Gast
 * bekommt die Standardanalyse, aber keine Agenten. Damit ist die Anmeldung
 * nicht nur eine größere Zahl, sondern ein anderer Funktionsumfang.
 *
 * Sie stehen hier statt in lib/ai/quota.ts, weil die Oberfläche sie nennt und
 * quota.ts server-only ist.
 */
export const CREDIT_PLANS = {
  guest: {
    id: "guest",
    label: "Gast",
    monthlyCredits: 100,
    agents: false,
    purchasable: false,
    euro: 0,
  },
  free: {
    id: "free",
    label: "Free",
    monthlyCredits: 300,
    agents: true,
    purchasable: false,
    euro: 0,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    monthlyCredits: 3_000,
    agents: true,
    purchasable: true,
    euro: 50,
  },
} as const;

export type CreditPlanId = keyof typeof CREDIT_PLANS;
export type CreditPlan = (typeof CREDIT_PLANS)[CreditPlanId];

export function isCreditPlanId(value: unknown): value is CreditPlanId {
  return typeof value === "string" && value in CREDIT_PLANS;
}

/** Fällt auf die Gratisstufe zurück, statt an einem unbekannten Wert zu scheitern. */
export function creditPlan(
  planId: string | null | undefined,
  isAnonymous = false,
): CreditPlan {
  if (isCreditPlanId(planId)) return CREDIT_PLANS[planId];
  return isAnonymous ? CREDIT_PLANS.guest : CREDIT_PLANS.free;
}

export const GUEST_MONTHLY_CREDITS = CREDIT_PLANS.guest.monthlyCredits;
export const ACCOUNT_MONTHLY_CREDITS = CREDIT_PLANS.free.monthlyCredits;

/**
 * Token weights:
 * - cached input: 1 weighted unit / token
 * - uncached input: 10 weighted units / token
 * - output: 60 weighted units / token
 * - one credit covers 1,000 weighted units, rounded half-up
 *
 * Calibrated on 30 confirmed `project_brief` settlements measured on
 * 2026-08-20/21 (gpt-5.4-nano): input is near-constant at ~928 tokens because
 * the system prompt dominates, output varies between 93 and 407.
 *
 * `project_brief` no longer meters at all — it is sold at the flat
 * BRIEF_ANALYSIS_CREDITS price. Its multiplier is kept at 1.0x so that a
 * settlement recorded under this version can still be compared against what
 * the metering would have charged.
 *
 * `research` hat einen Festpreis aus CREDIT_PRICES und wird deshalb nicht
 * mehr gemessen. Der Multiplikator bleibt stehen, damit eine Abrechnung unter
 * dieser Version gegen die abgelöste Messung vergleichbar bleibt.
 *
 * The weights are centrally versioned product policy. Allocation totals are a
 * separate business decision and live in lib/ai/quota.ts.
 */
export const XPORTAL_AI_CREDIT_POLICY = {
  version: XPORTAL_AI_CREDIT_POLICY_VERSION,
  unitLabel: "XPORTAL_AI_CREDIT",
  weightedUnitsPerCredit: 1_000,
  tokenWeights: {
    uncachedInput: 10,
    cachedInput: 1,
    output: 60,
  },
  defaultPurposeMultiplierBasisPoints: 10_000,
  purposeMultiplierBasisPoints: {
    chat: 10_000,
    project_brief: 10_000,
    insight: 10_000,
    router: 10_000,
    research: 1_000,
    analysis: 10_000,
    mesh_agent: 10_000,
    final_synthesis: 10_000,
  },
  defaultModelMultiplierBasisPoints: 10_000,
  // Aus der Preisliste abgeleitet, damit ein Preis nicht an zwei Stellen
  // stehen kann. Die Schlüssel sind zugleich die `purpose`-Werte der Anfragen.
  flatPriceCredits: {
    project_brief: CREDIT_PRICES.project_brief.credits,
    research: CREDIT_PRICES.research.credits,
  },
  modelMultiplierBasisPoints: {
    "gpt-5.4-nano": 10_000,
    "gpt-5.5-pro": 190_000,
    "gpt-5.6-luna": 10_000,
    "gpt-5.6-terra": 100_000,
  },
} as const satisfies AiCreditPolicy;

export type AiCreditCalculation = {
  creditsConsumed: number;
  /** The fixed price applied, or null when the purpose was metered. */
  flatPriceCredits: number | null;
  /** What token weighting would have charged. Equal to creditsConsumed
   * whenever no flat price applies. Kept for reconciliation. */
  meteredCredits: number;
  policyVersion: string;
  unitLabel: "XPORTAL_AI_CREDIT";
  meteredModel: string;
  purpose: string;
  baseWeightedUnits: string;
  purposeMultiplierBasisPoints: number;
  modelMultiplierBasisPoints: number;
  usedDefaultPurposeMultiplier: boolean;
  usedDefaultModelMultiplier: boolean;
};

const BASIS_POINTS = 10_000n;

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function validatePolicy(policy: AiCreditPolicy): void {
  assertPositiveSafeInteger(
    "weightedUnitsPerCredit",
    policy.weightedUnitsPerCredit,
  );
  assertPositiveSafeInteger(
    "tokenWeights.uncachedInput",
    policy.tokenWeights.uncachedInput,
  );
  assertPositiveSafeInteger(
    "tokenWeights.cachedInput",
    policy.tokenWeights.cachedInput,
  );
  assertPositiveSafeInteger(
    "tokenWeights.output",
    policy.tokenWeights.output,
  );
  assertPositiveSafeInteger(
    "defaultPurposeMultiplierBasisPoints",
    policy.defaultPurposeMultiplierBasisPoints,
  );
  assertPositiveSafeInteger(
    "defaultModelMultiplierBasisPoints",
    policy.defaultModelMultiplierBasisPoints,
  );
  for (const [purpose, price] of Object.entries(policy.flatPriceCredits)) {
    assertPositiveSafeInteger(`flatPriceCredits.${purpose}`, price);
  }
}

/**
 * Commercial rounding. `ceil` billed a request costing 2.01 credits as 3,
 * a systematic 20.1% overcharge at the old resolution. Half-up keeps the
 * rounding error symmetric and below 2.5% at current prices.
 *
 * Any real usage still costs at least one credit, so a request can never be
 * metered as free.
 */
function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) return 0n;
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  return rounded === 0n ? 1n : rounded;
}

export function calculateCreditsConsumed(
  input: AiModelIdentity &
    AiTokenUsage & {
      purpose: string;
    },
  policy: AiCreditPolicy = XPORTAL_AI_CREDIT_POLICY,
): AiCreditCalculation {
  validatePolicy(policy);

  const usage = normalizeAiTokenUsage(input);
  const meteredModel = resolveMeteredModel(input);
  const purpose = input.purpose.trim() || "unknown";

  const configuredPurposeMultiplier =
    policy.purposeMultiplierBasisPoints[purpose];
  const purposeMultiplierBasisPoints =
    configuredPurposeMultiplier ??
    policy.defaultPurposeMultiplierBasisPoints;
  assertPositiveSafeInteger(
    "purposeMultiplierBasisPoints",
    purposeMultiplierBasisPoints,
  );

  const configuredModelMultiplier =
    policy.modelMultiplierBasisPoints[meteredModel];
  const modelMultiplierBasisPoints =
    configuredModelMultiplier ?? policy.defaultModelMultiplierBasisPoints;
  assertPositiveSafeInteger(
    "modelMultiplierBasisPoints",
    modelMultiplierBasisPoints,
  );

  const baseWeightedUnits =
    BigInt(usage.uncachedInputTokens + usage.cacheWriteTokens) *
      BigInt(policy.tokenWeights.uncachedInput) +
    BigInt(usage.cachedInputTokens) *
      BigInt(policy.tokenWeights.cachedInput) +
    BigInt(usage.outputTokens) * BigInt(policy.tokenWeights.output);

  const numerator =
    baseWeightedUnits *
    BigInt(purposeMultiplierBasisPoints) *
    BigInt(modelMultiplierBasisPoints);
  const denominator =
    BigInt(policy.weightedUnitsPerCredit) * BASIS_POINTS * BASIS_POINTS;
  const meteredCredits = divideAndRoundHalfUp(numerator, denominator);

  if (meteredCredits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("creditsConsumed exceeds the safe integer range");
  }

  // A request that never reached the provider stays free even at a flat price.
  // Otherwise a failed attempt would bill the customer for nothing.
  const flatPrice = policy.flatPriceCredits[purpose];
  const creditsConsumed =
    flatPrice === undefined
      ? Number(meteredCredits)
      : baseWeightedUnits === 0n
        ? 0
        : flatPrice;

  return {
    creditsConsumed,
    flatPriceCredits: flatPrice ?? null,
    meteredCredits: Number(meteredCredits),
    policyVersion: policy.version,
    unitLabel: policy.unitLabel,
    meteredModel,
    purpose,
    baseWeightedUnits: baseWeightedUnits.toString(),
    purposeMultiplierBasisPoints,
    modelMultiplierBasisPoints,
    usedDefaultPurposeMultiplier: configuredPurposeMultiplier === undefined,
    usedDefaultModelMultiplier: configuredModelMultiplier === undefined,
  };
}
