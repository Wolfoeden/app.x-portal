import type { SupabaseClient } from "@supabase/supabase-js";

import { avatarImageUrl } from "@/lib/freelancer/avatar-limits";
import {
  FreelancerProfileSchema,
  type FactSource,
  type FreelancerProfile,
  type LabeledFact,
} from "@/lib/domain";

export type FreelancerProfileRow = {
  id: string;
  avatar_path?: string | null;
  display_name: string;
  role_title: string;
  skill_tags: string[];
  languages: string[];
  location_text: string | null;
  work_modes: Array<"remote" | "on_site" | "hybrid">;
  experience_summary: string;
  verified_facts: string[];
  self_reported_facts: string[];
  verification_status:
    | "unverified"
    | "identity_checked"
    | "references_checked"
    | "operator_verified";
  hourly_rate_minor: number | null;
  day_rate_minor: number | null;
  currency: "EUR" | "USD" | "GBP" | null;
  profile_status: "active" | "paused" | "unavailable" | "archived";
  availability_status: "available" | "limited" | "unavailable" | "unknown";
  availability_from: string | null;
  availability_updated_at: string;
  intro_policy: "free" | "manual_approval";
  booking_url: string | null;
  demo_status: "demo" | "real";
  version: number;
};

const FREELANCER_PROFILE_SELECT =
  "id,avatar_path,display_name,role_title,skill_tags,languages,location_text,work_modes,experience_summary,verified_facts,self_reported_facts,verification_status,hourly_rate_minor,day_rate_minor,currency,profile_status,availability_status,availability_from,availability_updated_at,intro_policy,booking_url,demo_status,version";

function normalizeFact(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

function sourceFor(
  value: string,
  label: string,
  verifiedFacts: readonly string[],
  selfReportedFacts: readonly string[],
): FactSource {
  const candidates = new Set([
    normalizeFact(value),
    normalizeFact(`${label}: ${value}`),
  ]);

  if (verifiedFacts.some((fact) => candidates.has(normalizeFact(fact)))) {
    return "verified";
  }
  if (selfReportedFacts.some((fact) => candidates.has(normalizeFact(fact)))) {
    return "self_reported";
  }

  // Missing provenance must never be upgraded to verified.
  return "self_reported";
}

function labeledFacts(
  values: readonly string[],
  label: string,
  row: Pick<FreelancerProfileRow, "verified_facts" | "self_reported_facts">,
): LabeledFact[] {
  return values.map((value) => ({
    value,
    source: sourceFor(value, label, row.verified_facts, row.self_reported_facts),
  }));
}

function factsWithPrefix(facts: readonly string[], prefix: string): string[] {
  const normalizedPrefix = `${prefix.toLocaleLowerCase("en-US")}:`;
  return facts.flatMap((fact) => {
    const separator = fact.indexOf(":");
    if (separator < 0) return [];
    if (
      fact.slice(0, separator + 1).trim().toLocaleLowerCase("en-US") !==
      normalizedPrefix
    ) {
      return [];
    }
    const value = fact.slice(separator + 1).trim();
    return value ? [value] : [];
  });
}

/**
 * Categories carried inside `skill_tags` that describe context rather than a
 * skill claim. `searchableSkillTags` drops them so they cannot satisfy a skill
 * requirement; this list is what recovers them as separate evidence.
 *
 * "Qualification" and "Contract capability" are absent on purpose — they are
 * already mapped to their own profile fields from the fact columns.
 */
const CONTEXT_EVIDENCE_CATEGORIES = ["Industry", "Certification", "Experience", "Focus"] as const;

function contextEvidenceTags(values: readonly string[]): string[] {
  return CONTEXT_EVIDENCE_CATEGORIES.flatMap((category) =>
    factsWithPrefix(values, category).map((value) => `${category}: ${value}`),
  );
}

function searchableSkillTags(values: readonly string[]): string[] {
  const prefixedSkills = factsWithPrefix(values, "Skill");
  if (prefixedSkills.length) return prefixedSkills;

  // Older curated rows may contain plain skill values. Metadata prefixed with
  // another category must never accidentally become a matching signal.
  return values.filter((value) => !/^[\p{L}\s_-]+:/u.test(value.trim()));
}

function isSecureBookingUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function rateFromMinor(
  amount: number | null,
  currency: FreelancerProfileRow["currency"],
) {
  if (amount === null || currency === null) return null;
  return { amount: amount / 100, currency };
}

function canonicalLanguage(value: string): string {
  const aliases: Readonly<Record<string, string>> = {
    de: "German",
    en: "English",
    es: "Spanish",
    fr: "French",
    it: "Italian",
    nl: "Dutch",
    pl: "Polish",
  };
  return aliases[value.trim().toLocaleLowerCase("en-US")] ?? value;
}

export function mapFreelancerProfileRow(
  row: FreelancerProfileRow,
): FreelancerProfile {
  const qualifications = [
    ...factsWithPrefix(row.verified_facts, "Qualification"),
    ...factsWithPrefix(row.self_reported_facts, "Qualification"),
  ];
  const contractualCapabilities = [
    ...factsWithPrefix(row.verified_facts, "Contract capability"),
    ...factsWithPrefix(row.self_reported_facts, "Contract capability"),
  ];

  return FreelancerProfileSchema.parse({
    id: row.id,
    dataVersion: `profile-v${row.version}`,
    demoStatus: row.demo_status,
    avatarUrl: avatarImageUrl(row.avatar_path ?? null),
    profileStatus: row.profile_status === "active" ? "active" : row.profile_status === "archived" ? "archived" : "paused",
    displayName: row.display_name,
    role: row.role_title,
    skillTags: labeledFacts(searchableSkillTags(row.skill_tags), "Skill", row),
    contextEvidence: labeledFacts(contextEvidenceTags(row.skill_tags), "Skill", row),
    languages: labeledFacts(
      row.languages.map(canonicalLanguage),
      "Language",
      row,
    ),
    location: row.location_text
      ? {
          value: row.location_text,
          source: sourceFor(row.location_text, "Location", row.verified_facts, row.self_reported_facts),
        }
      : null,
    workModes: row.work_modes,
    experienceSummary: {
      value: row.experience_summary,
      source: sourceFor(row.experience_summary, "Experience", row.verified_facts, row.self_reported_facts),
    },
    qualifications: labeledFacts(qualifications, "Qualification", row),
    contractualCapabilities: labeledFacts(
      contractualCapabilities,
      "Contract capability",
      row,
    ),
    referenceStatus:
      row.verification_status === "operator_verified" ||
      row.verification_status === "references_checked"
        ? "verified"
        : row.verification_status === "identity_checked"
          ? "self_reported"
          : "not_verified",
    hourlyRate: rateFromMinor(row.hourly_rate_minor, row.currency),
    dayRate: rateFromMinor(row.day_rate_minor, row.currency),
    minimumProjectBudget: null,
    availability: {
      status:
        row.profile_status !== "active"
          ? "unavailable"
          : row.availability_status,
      availableFrom: row.availability_from,
      checkedAt: row.availability_updated_at,
    },
    introPolicy: {
      type: row.intro_policy === "free" ? "free" : "premium",
      label:
        row.intro_policy === "free"
          ? "Kostenfreies Erstgespräch"
          : "Kontakt nach manueller Freigabe",
      bookingUrl: row.booking_url,
    },
  });
}

export async function fetchActiveBookableRealProfiles(
  supabase: SupabaseClient,
): Promise<FreelancerProfile[]> {
  const { data, error } = await supabase
    .from("freelancer_profiles")
    .select(FREELANCER_PROFILE_SELECT)
    .eq("profile_status", "active")
    .eq("demo_status", "real")
    .not("booking_url", "is", null)
    .in("availability_status", ["available", "limited", "unknown"]);

  if (error) throw error;
  return (data as FreelancerProfileRow[])
    .filter(
      (row) =>
        row.profile_status === "active" &&
        row.demo_status === "real" &&
        row.availability_status !== "unavailable" &&
        isSecureBookingUrl(row.booking_url),
    )
    .map(mapFreelancerProfileRow);
}

export async function fetchRealProfilesByIds(
  supabase: SupabaseClient,
  profileIds: readonly string[],
): Promise<FreelancerProfile[]> {
  const ids = [...new Set(profileIds)];
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("freelancer_profiles")
    .select(FREELANCER_PROFILE_SELECT)
    .eq("demo_status", "real")
    .in("id", ids);

  if (error) throw error;
  return (data as FreelancerProfileRow[])
    .filter((row) => row.demo_status === "real")
    .map(mapFreelancerProfileRow);
}
