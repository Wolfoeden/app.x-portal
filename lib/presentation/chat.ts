import type {
  FreelancerProfileResult,
  ProfileFact,
  ProjectMode,
  StructuredBrief,
} from "@/components/chat-contract";
import type {
  FreelancerProfile,
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
  // Shown although it is a filter rather than a requirement: a misread
  // exclusion is invisible in the result — the client sees the candidates that
  // are there, never the ones wrongly removed.
  const excludedSkills = (brief.excludedSkills ?? []).slice(0, 4);
  if (excludedSkills.length) {
    details.push(`Ausgeschlossen: ${excludedSkills.join(", ")}`);
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
  return formatProfileRate(match.profile);
}

function formatProfileRate(profile: FreelancerProfile): string | null {
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

function presentReferenceStatus(
  status: FreelancerProfile["referenceStatus"],
): string {
  return status === "not_verified"
    ? "Nicht verifiziert"
    : status === "self_reported"
      ? "Selbstauskunft"
      : "Verifiziert";
}

/**
 * A saved profile has no match behind it: it was never evaluated against a
 * brief. Score, coverage, matched reasons and known gaps therefore stay null
 * and empty rather than being invented, so a card on "Mein Team" can never
 * read as a recommendation for a project it was never assessed for.
 */
export function presentSavedProfile(
  profile: FreelancerProfile,
): FreelancerProfileResult {
  const firstMode = profile.workModes[0] ?? "unknown";
  const bookingUrl = profile.introPolicy.bookingUrl;
  const facts: ProfileFact[] = [
    ...profile.qualifications,
    ...profile.contractualCapabilities,
    ...profile.contextEvidence,
  ].map((fact) => ({
    label: fact.source === "verified" ? "Geprüft" : "Selbstauskunft",
    value: fact.value,
    verification: fact.source === "verified" ? "verified" : "self-reported",
  }));

  return {
    id: profile.id,
    demoStatus: profile.demoStatus,
    avatarUrl: profile.avatarUrl,
    bookingUrl,
    displayName: profile.displayName,
    role: profile.role,
    skillTags: profile.skillTags.map(({ value }) => value),
    languages: profile.languages.map(({ value }) => value),
    location: profile.location?.value ?? null,
    remoteMode: presentMode(firstMode),
    experienceSummary: profile.experienceSummary.value,
    facts,
    referenceStatus: presentReferenceStatus(profile.referenceStatus),
    rate: formatProfileRate(profile),
    availabilityStatus: profile.availability.status,
    availabilityUpdatedAt: profile.availability.checkedAt,
    matchReasons: [],
    knownGaps: [],
    recommendationRole: null,
    fitScore: null,
    coreCoverage: null,
    introPolicy: {
      type: bookingUrl ? "free" : "premium",
      label: bookingUrl
        ? "Direkt buchbares Erstgespräch"
        : "Aktuell nicht direkt buchbar",
      manualApprovalRequired: !bookingUrl,
      readyToBook: Boolean(bookingUrl),
    },
  };
}

export function presentMatch(match: ShortlistMatch): FreelancerProfileResult {
  const profile = match.profile;
  const firstMode = profile.workModes[0] ?? "unknown";
  // A partial result is evidence for comparison, never a recommendation or an
  // introduction entitlement. Hiding the URL here protects both the immediate
  // response and persisted/reloaded snapshots independently of the UI.
  const isPartial = match.recommendationRole === "partial";
  // A partial result keeps its booking URL. It is still labelled as not
  // recommended everywhere it appears, but the reader decides whether to make
  // contact; withholding the link decided that for them.
  const bookingUrl = profile.introPolicy.bookingUrl;

  return {
    id: profile.id,
    demoStatus: profile.demoStatus,
    avatarUrl: profile.avatarUrl,
    bookingUrl,
    displayName: profile.displayName,
    role: profile.role,
    skillTags: profile.skillTags.map(({ value }) => value),
    languages: profile.languages.map(({ value }) => value),
    location: profile.location?.value ?? null,
    remoteMode: presentMode(firstMode),
    experienceSummary: profile.experienceSummary.value,
    facts: profileFacts(match),
    referenceStatus: presentReferenceStatus(profile.referenceStatus),
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
        ? bookingUrl
          ? "Nicht empfohlen – Kontakt dennoch möglich"
          : "Nicht empfohlen – aktuell nicht direkt buchbar"
        : bookingUrl
          ? "Direkt buchbares Erstgespräch"
          : "Aktuell nicht direkt buchbar",
      manualApprovalRequired: !bookingUrl,
      readyToBook: Boolean(bookingUrl),
    },
  };
}
