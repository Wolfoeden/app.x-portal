import type { ShowcaseProfile } from "@/lib/freelancer/showcase";
import type { AvailabilityStatus, Seeking, WorkMode } from "@/lib/freelancer/limits";
import { placementRequestsEnabled } from "@/lib/placement/config";

/**
 * Die Profilkarte, wie Kunden sie nach der Freigabe sehen, gebaut aus dem,
 * was jemand gerade ins Bewerbungsformular schreibt. Sie zeigt auch die
 * offenen Punkte, die auf der Karte stünden — ein fehlendes Honorar sieht der
 * Bewerber so, bevor ein Kunde es vermisst.
 *
 * Nichts davon ist geprüft: Den Haken setzt erst XPORTAL nach der Sichtung.
 */
export type ApplicationPreviewInput = {
  fullName: string;
  roleTitle: string;
  skills: readonly string[];
  locationText: string;
  workModes: readonly WorkMode[];
  hourlyRate: string;
  dayRate: string;
  currency: string;
  availabilityStatus: AvailabilityStatus;
  availabilityFrom: string;
  bookingUrl: string;
  seeking: Seeking;
};

const PREVIEW_SKILLS = 4;

/** Für eine feste Stelle steht kein Honorar auf der Karte, sondern das. */
export const EMPLOYMENT_RATE_LABEL = "Gehalt nach Absprache";

function amount(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatRate(value: number, currency: string, unit: "Tag" | "Stunde"): string {
  try {
    return `${new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)} / ${unit}`;
  } catch {
    return `${Math.round(value).toLocaleString("de-DE")} ${currency} / ${unit}`;
  }
}

/** Tagessatz vor Stundensatz, wie auf den Ergebniskarten. */
export function previewRate(input: Pick<ApplicationPreviewInput, "dayRate" | "hourlyRate" | "currency" | "seeking">): string | null {
  if (input.seeking === "employment") return EMPLOYMENT_RATE_LABEL;
  const day = amount(input.dayRate);
  if (day !== null) return formatRate(day, input.currency, "Tag");
  const hour = amount(input.hourlyRate);
  return hour === null ? null : formatRate(hour, input.currency, "Stunde");
}

export function applicationPreviewProfile(input: ApplicationPreviewInput, now: Date): ShowcaseProfile {
  return {
    id: "vorschau",
    displayName: input.fullName.trim() || "Ihr Name",
    role: input.roleTitle.trim() || "Ihre Rolle",
    avatarUrl: null,
    evidence: input.skills
      .slice(0, PREVIEW_SKILLS)
      .map((skill) => ({ skill, required: false, verified: false })),
    rate: previewRate(input),
    availability: {
      status: input.availabilityStatus,
      updatedAt: now.toISOString(),
      availableFrom: input.availabilityFrom || null,
    },
    contact: placementRequestsEnabled() ? "request" : input.bookingUrl.trim() ? "calendar" : "none",
    location: input.locationText.trim() || null,
    workModes: [...input.workModes],
    verified: false,
  };
}

/** Ein ausgedachtes Profil für die Einstiegsseite, deutlich als Beispiel markiert. */
export function exampleApplicationPreview(now: Date): ShowcaseProfile {
  return applicationPreviewProfile(
    {
      fullName: "Anna Beispiel",
      roleTitle: "Senior Frontend-Entwicklerin",
      skills: ["React", "TypeScript", "Next.js", "Design Systems"],
      locationText: "Leipzig",
      workModes: ["remote", "hybrid"],
      hourlyRate: "",
      dayRate: "760",
      currency: "EUR",
      availabilityStatus: "available",
      availabilityFrom: "",
      // Ohne Vermittlungsmodell zeigte die Karte sonst „kein direkter Kontaktweg“.
      bookingUrl: "https://cal.com/anna-beispiel",
      seeking: "both",
    },
    now,
  );
}
