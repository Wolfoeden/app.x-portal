export type ProcessEconomics = {
  hoursPerMonth: number | null;
  currentProcessCost: number | null;
};

export function parseNonNegativeDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/u.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function calculateProcessEconomics(input: {
  volumePerMonth: string;
  minutesPerCase: string;
  hourlyCost: string;
}): ProcessEconomics {
  const volume = parseNonNegativeDecimal(input.volumePerMonth);
  const minutes = parseNonNegativeDecimal(input.minutesPerCase);
  const cost = parseNonNegativeDecimal(input.hourlyCost);
  const rawHours =
    volume !== null && minutes !== null ? (volume * minutes) / 60 : null;
  const hoursPerMonth = rawHours !== null && Number.isFinite(rawHours) ? rawHours : null;
  const processCost = hoursPerMonth !== null && cost !== null ? hoursPerMonth * cost : null;
  return {
    hoursPerMonth,
    currentProcessCost:
      processCost !== null && Number.isFinite(processCost) ? processCost : null,
  };
}
