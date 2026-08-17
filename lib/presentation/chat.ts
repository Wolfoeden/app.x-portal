import type {
  FreelancerProfileResult,
  ProfileFact,
  ProjectMode,
  StructuredBrief,
} from "@/components/chat-contract";
import type {
  ProjectBrief,
  ShortlistMatch,
} from "@/lib/domain";
import { detectRequestLanguage } from "./request-language";

function presentMode(mode: ProjectBrief["workMode"]): ProjectMode {
  return mode === "on_site" ? "on-site" : mode;
}

function formatMoney(
  value:
    | ProjectBrief["budget"]
    | ProjectBrief["rate"],
): string | null {
  if (!value) return null;

  const range = [value.min, value.max]
    .filter((amount): amount is number => amount !== null)
    .filter((amount, index, values) => values.indexOf(amount) === index)
    .map((amount) => new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: value.currency,
      maximumFractionDigits: 2,
    }).format(amount))
    .join("–");

  return "unit" in value
    ? `${range} pro ${value.unit === "hour" ? "Stunde" : "Tag"}`
    : range;
}

function briefSummary(brief: ProjectBrief): string {
  const details: string[] = [];
  const requiredSkillGroups =
    brief.schemaVersion === 2
      ? brief.requirementGroups
          .filter(
            (group) => group.category === "skill" && group.priority !== "optional",
          )
          .slice(0, 4)
      : [];
  const requiredSkills = (brief.requiredSkills ?? []).slice(0, 4);
  if (requiredSkillGroups.length) {
    details.push(
      `Kernkompetenzen: ${requiredSkillGroups
        .map((group) =>
          group.values.join(group.operator === "any_of" ? " oder " : " und "),
        )
        .join(" · ")}`,
    );
  } else if (requiredSkills.length) {
    details.push(`Pflichtkompetenzen: ${requiredSkills.join(", ")}`);
  }
  if (brief.language) details.push(`Sprache: ${brief.language}`);
  if (brief.workMode !== "unknown") {
    details.push(
      brief.workMode === "on_site"
        ? "Arbeitsmodus: vor Ort"
        : `Arbeitsmodus: ${brief.workMode}`,
    );
  }
  if (brief.location) details.push(`Ort: ${brief.location}`);
  if (brief.startWindow?.raw) details.push(`Start: ${brief.startWindow.raw}`);
  if (brief.duration?.raw) details.push(`Dauer: ${brief.duration.raw}`);
  const commercial = formatMoney(brief.rate) ?? formatMoney(brief.budget);
  if (commercial) details.push(`Budget / Satz: ${commercial}`);
  const constraints = (brief.constraints ?? []).slice(0, 3);
  if (constraints.length) {
    details.push(`Rahmenbedingungen: ${constraints.join(", ")}`);
  }

  return details.length
    ? details.join(" · ")
    : "Die Anfrage enthält noch keine sicher erkannten Projektdetails.";
}

export function presentBrief(brief: ProjectBrief): StructuredBrief {
  // An explicitly requested language wins, because only that one filters
  // profiles. Otherwise fall back to the language the request was written in —
  // display only, never fed back into `brief.language`.
  const detectedLanguage = brief.language
    ? null
    : detectRequestLanguage(brief.originalRequest);
  const language = brief.language ?? detectedLanguage;

  return {
    projectTitle: brief.projectTitle ?? "Freelancer-Anfrage",
    // Never repeat the accumulated raw prompt as an apparent AI summary.
    // Every visible statement below comes from the accepted structured brief.
    summary: briefSummary(brief),
    requiredSkills: brief.requiredSkills ?? [],
    optionalSkills: brief.optionalSkills ?? [],
    languages: language ? [language] : [],
    languageSource: brief.language ? "required" : detectedLanguage ? "detected" : null,
    mode: presentMode(brief.workMode),
    location: brief.location,
    startWindow: brief.startWindow?.raw ?? null,
    duration: brief.duration?.raw ?? null,
    budgetOrRate: formatMoney(brief.rate) ?? formatMoney(brief.budget),
    constraints: brief.constraints ?? [],
    qualifications: brief.qualifications ?? [],
    availabilityRequirement: brief.availabilityRequirement,
    contractualRequirements: brief.contractualRequirements ?? [],
    unknownFields: brief.unknownFields,
    requirementGroups:
      brief.schemaVersion === 2
        ? brief.requirementGroups.map(
            ({ id, category, priority, operator, values }) => ({
              id,
              category,
              priority,
              operator,
              values,
            }),
          )
        : [],
  };
}

function profileFacts(match: ShortlistMatch): ProfileFact[] {
  return [
    ...match.verifiedFacts.map((value) => ({
      label: "Geprüft",
      value,
      verification: "verified" as const,
    })),
    ...match.selfReportedFacts.map((value) => ({
      label: "Selbstauskunft",
      value,
      verification: "self-reported" as const,
    })),
  ];
}

function formatRate(match: ShortlistMatch): string | null {
  const profile = match.profile;
  if (profile.dayRate) {
    return `${new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: profile.dayRate.currency,
      maximumFractionDigits: 0,
    }).format(profile.dayRate.amount)} / Tag`;
  }
  if (profile.hourlyRate) {
    return `${new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: profile.hourlyRate.currency,
      maximumFractionDigits: 0,
    }).format(profile.hourlyRate.amount)} / Stunde`;
  }
  return null;
}

export function presentMatch(match: ShortlistMatch): FreelancerProfileResult {
  const profile = match.profile;
  const firstMode = profile.workModes[0] ?? "unknown";
  // A partial result is evidence for comparison, never a recommendation or an
  // introduction entitlement. Hiding the URL here protects both the immediate
  // response and persisted/reloaded snapshots independently of the UI.
  const isPartial = match.recommendationRole === "partial";
  const bookingUrl = isPartial ? null : profile.introPolicy.bookingUrl;

  return {
    id: profile.id,
    demoStatus: profile.demoStatus,
    bookingUrl,
    displayName: profile.displayName,
    role: profile.role,
    skillTags: profile.skillTags.map(({ value }) => value),
    languages: profile.languages.map(({ value }) => value),
    location: profile.location?.value ?? null,
    remoteMode: presentMode(firstMode),
    experienceSummary: profile.experienceSummary.value,
    facts: profileFacts(match),
    referenceStatus:
      profile.referenceStatus === "not_verified"
        ? "Nicht verifiziert"
        : profile.referenceStatus === "self_reported"
          ? "Selbstauskunft"
          : "Verifiziert",
    rate: formatRate(match),
    availabilityStatus: match.availabilityStatus,
    availabilityUpdatedAt: match.availabilityCheckedAt,
    matchReasons: match.matchReasons,
    knownGaps: match.knownGaps,
    recommendationRole: match.recommendationRole ?? null,
    fitScore: match.fitScore ?? null,
    coreCoverage: match.coreCoverage ?? null,
    introPolicy: {
      type: bookingUrl ? "free" : "premium",
      label: isPartial
        ? "Nicht empfohlen – keine direkte Buchung"
        : bookingUrl
          ? "Direkt buchbares Erstgespräch"
          : "Aktuell nicht direkt buchbar",
      manualApprovalRequired: !bookingUrl,
      readyToBook: Boolean(bookingUrl),
    },
  };
}
