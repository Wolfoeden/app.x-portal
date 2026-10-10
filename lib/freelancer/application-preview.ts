import type { ShowcaseProfile } from "@/lib/freelancer/showcase";
import type { AvailabilityStatus, Seeking, WorkMode } from "@/lib/freelancer/limits";
import { placementRequestsEnabled } from "@/lib/placement/config";
import { summaryExcerpt } from "@/lib/profile/excerpt";
import type { ProfileField } from "@/lib/profile/identity";
import { pickHighlight, projectMatchScore, projectTeaser, type ProfileProject } from "@/lib/profile/project-limits";

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
  monthlySalary?: string;
  hourlyRate: string;
  dayRate: string;
  currency: string;
  availabilityStatus: AvailabilityStatus;
  availabilityFrom: string;
  bookingUrl: string;
  seeking: Seeking;
  experienceSummary?: string;
  /** Nur für das ausgedachte Beispiel; sonst bestimmt das Gebiet der Server. */
  field?: ProfileField | null;
  /** Das gewählte Foto als `data:`-Adresse; es verlässt den Browser dafür nicht. */
  avatarUrl?: string | null;
  /** Die Projekte aus dem Formular; auf der Karte steht nur, was gezeigt werden soll. */
  projects?: readonly ProfileProject[];
  /** Begriffe einer lokalen Testanfrage; sie wählen nur die sichtbare Referenz. */
  queryTerms?: readonly string[];
};

const PREVIEW_SKILLS = 4;

/** Für eine feste Stelle steht kein Honorar auf der Karte, sondern das. */
export const EMPLOYMENT_RATE_LABEL = "Gehalt nach Absprache";

function amount(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  const parsed = Number(normalized.replace(",", "."));
  return normalized && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatRate(value: number, currency: string, unit: "Monat" | "Tag" | "Stunde"): string {
  try {
    return `${new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)} / ${unit}`;
  } catch {
    return `${Math.round(value).toLocaleString("de-DE")} ${currency} / ${unit}`;
  }
}

/** Tagessatz vor Stundensatz, wie auf den Ergebniskarten. */
export function previewRate(input: Pick<ApplicationPreviewInput, "monthlySalary" | "dayRate" | "hourlyRate" | "currency" | "seeking">): string | null {
  const monthly = amount(input.monthlySalary);
  if (monthly !== null) return formatRate(monthly, input.currency, "Monat");
  if (input.seeking === "employment") return EMPLOYMENT_RATE_LABEL;
  const day = amount(input.dayRate);
  if (day !== null) return formatRate(day, input.currency, "Tag");
  const hour = amount(input.hourlyRate);
  return hour === null ? null : formatRate(hour, input.currency, "Stunde");
}

export function applicationPreviewProfile(input: ApplicationPreviewInput, now: Date): ShowcaseProfile {
  const shown = (input.projects ?? []).filter((project) => project.isPublic && project.title.trim().length >= 3);
  const highlight = pickHighlight(shown, input.queryTerms);
  return {
    id: "vorschau",
    displayName: input.fullName.trim() || "Ihr Name",
    role: input.roleTitle.trim() || "Ihre Rolle",
    avatarUrl: input.avatarUrl ?? null,
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
    // Das Fachgebiet bestimmt erst der Server; die Vorschau zeigt ein neutrales Band.
    field: input.field ?? null,
    summaryExcerpt: summaryExcerpt(input.experienceSummary),
    highlight: highlight ? projectTeaser(highlight, projectMatchScore(highlight, input.queryTerms ?? []) > 0) : null,
    projectCount: shown.length,
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
      monthlySalary: "",
      hourlyRate: "",
      dayRate: "760",
      currency: "EUR",
      availabilityStatus: "available",
      availabilityFrom: "",
      // Ohne Vermittlungsmodell zeigte die Karte sonst „kein direkter Kontaktweg“.
      bookingUrl: "https://cal.com/anna-beispiel",
      seeking: "both",
      experienceSummary:
        "Baut seit acht Jahren Weboberflächen für Banken und Versicherer, zuletzt ein Designsystem für 40 Produktteams.",
      field: "frontend",
      projects: [
        {
          title: "Designsystem für eine Direktbank",
          client: null,
          industry: "Banken",
          role: "Lead Frontend",
          startedOn: "2023-04",
          endedOn: "2025-02",
          ongoing: false,
          technologies: ["React", "TypeScript", "Storybook"],
          outcome: null,
          link: null,
          isPublic: true,
          verified: false,
          source: "application",
          sourceUrl: null,
        },
      ],
    },
    now,
  );
}
