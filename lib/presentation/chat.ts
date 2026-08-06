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

export function presentBrief(brief: ProjectBrief): StructuredBrief {
  return {
    projectTitle: brief.projectTitle ?? "Freelancer-Anfrage",
    summary: brief.summary,
    requiredSkills: brief.requiredSkills ?? [],
    optionalSkills: brief.optionalSkills ?? [],
    languages: brief.language ? [brief.language] : [],
    mode: presentMode(brief.workMode),
    location: brief.location,
    startWindow: brief.startWindow?.raw ?? null,
    duration: brief.duration?.raw ?? null,
    budgetOrRate: formatMoney(brief.rate) ?? formatMoney(brief.budget),
    constraints: brief.constraints ?? [],
    unknownFields: brief.unknownFields,
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

  return {
    id: profile.id,
    demoStatus: profile.demoStatus,
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
    availabilityStatus: "available",
    availabilityUpdatedAt: match.availabilityCheckedAt,
    matchReasons: match.matchReasons,
    knownGaps: match.knownGaps,
    introPolicy: {
      type: profile.introPolicy.type,
      label: profile.introPolicy.label,
      manualApprovalRequired: profile.introPolicy.type === "premium",
      readyToBook: profile.introPolicy.type === "free",
    },
  };
}
