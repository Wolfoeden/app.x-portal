/**
 * Woher eine Bewerbung kommt, wenn der Link ein `?quelle=` trägt. Bekannte
 * Quellen bekommen einen eigenen Willkommenstext und einen Reiter im
 * Adminbereich; jede andere gültige Quelle wird nur gespeichert.
 *
 * Wer über Agentur für Arbeit oder Jobcenter kommt, ist oft (noch) nicht
 * selbstständig. Der Text sagt deshalb zuerst, dass das kein Hindernis ist.
 */
export const KNOWN_REFERRALS = ["arbeitsagentur", "jobcenter"] as const;
export type KnownReferral = (typeof KNOWN_REFERRALS)[number];

export const REFERRAL_LABELS: Readonly<Record<KnownReferral, string>> = {
  arbeitsagentur: "Agentur für Arbeit",
  jobcenter: "Jobcenter",
};

const REFERRAL_VIA: Readonly<Record<KnownReferral, string>> = {
  arbeitsagentur: "über die Agentur für Arbeit",
  jobcenter: "über Ihr Jobcenter",
};

export function isKnownReferral(value: string | null | undefined): value is KnownReferral {
  return typeof value === "string" && (KNOWN_REFERRALS as readonly string[]).includes(value);
}

/** Für den Adminbereich: der Name einer bekannten Quelle, sonst das Kennzeichen. */
export function referralLabel(referral: string): string {
  return isKnownReferral(referral) ? REFERRAL_LABELS[referral] : referral;
}

/** Der Willkommenstext auf der Bewerbungsseite; `null` für unbekannte Quellen. */
export function referralWelcome(referral: string | null | undefined): string | null {
  if (!isKnownReferral(referral)) return null;
  return `Willkommen! Schön, dass Sie ${REFERRAL_VIA[referral]} zu uns finden. Die Anmeldung ist kostenlos. Sie können Projekte, eine feste Stelle oder beides suchen – und müssen dafür noch nicht selbstständig sein.`;
}
