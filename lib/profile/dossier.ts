import type { AvailabilityStatus } from "@/components/chat-contract";
import type { FreelancerProfile } from "@/lib/domain";
import type { WorkMode } from "@/lib/freelancer/limits";
import type { ProfileField } from "@/lib/profile/identity";

/**
 * Das vollständige Profil für die Detailansicht: im Seitenpanel des Chats und
 * auf `/profil/<id>`. Eine Quelle für beide, damit Kunden überall dasselbe
 * sehen.
 *
 * Alles, was der Freelancer nur angibt, bleibt als Angabe erkennbar; „geprüft“
 * steht nur dort, wo XPORTAL einen Nachweis gesehen hat. Die Ansicht bewertet
 * nichts gegen ein Projekt — das tut der Abgleich im Chat.
 */

export type DossierItem = { value: string; verified: boolean };
export type DossierFactGroup = { label: string; items: DossierItem[] };

export type DossierProjectSource = "freelancer" | "operator" | "application" | "research";

export type DossierProject = {
  title: string;
  client: string | null;
  industry: string | null;
  role: string | null;
  /** „2023 – 2024“, „seit 03/2025“ oder `null` ohne Zeitraum. */
  period: string | null;
  technologies: string[];
  outcome: string | null;
  link: string | null;
  verified: boolean;
  source: DossierProjectSource;
  /** Bei `research`: woher die Angabe stammt. */
  sourceUrl: string | null;
};

export type DossierLinkKind = "linkedin" | "website" | "github" | "portfolio" | "freelancermap";
export type DossierLink = { kind: DossierLinkKind; url: string };

export type ProfileDossier = {
  id: string;
  displayName: string;
  role: string;
  avatarUrl: string | null;
  field: ProfileField | null;
  location: string | null;
  workModes: WorkMode[];
  languages: string[];
  summary: string | null;
  referencesSummary: string | null;
  /** Geprüfte Kompetenzen zuerst. */
  skills: DossierItem[];
  facts: DossierFactGroup[];
  verified: boolean;
  verificationText: string;
  rate: string | null;
  availability: { status: AvailabilityStatus; updatedAt: string | null; availableFrom: string | null };
  contact: "request" | "calendar" | "none";
  projects: DossierProject[];
  links: DossierLink[];
};

export type DossierExtras = {
  avatarUrl: string | null;
  field: ProfileField | null;
  rate: string | null;
  referencesSummary?: string | null;
  projects?: DossierProject[];
  links?: DossierLink[];
};

const VERIFICATION_TEXT: Readonly<Record<FreelancerProfile["referenceStatus"], string>> = {
  verified: "Profilprüfung durch XPORTAL abgeschlossen",
  self_reported: "Angaben laut Freelancer; Referenzen nicht geprüft",
  not_verified: "Noch nicht von XPORTAL geprüft",
};

/** Kontext-Belege tragen ihre Art als Präfix („Industry: Banking“). */
const CONTEXT_LABELS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ["Industry", "Branchen"],
  ["Certification", "Zertifikate"],
  ["Experience", "Erfahrung"],
  ["Focus", "Schwerpunkte"],
];

function withoutPrefix(value: string): { prefix: string | null; text: string } {
  const match = value.match(/^([A-Za-z ]+):\s*(.+)$/u);
  return match ? { prefix: match[1]!.trim(), text: match[2]!.trim() } : { prefix: null, text: value.trim() };
}

function groupFacts(profile: FreelancerProfile): DossierFactGroup[] {
  const groups = new Map<string, DossierItem[]>();
  const add = (label: string, item: DossierItem) => {
    const list = groups.get(label) ?? [];
    if (!list.some((entry) => entry.value.toLowerCase() === item.value.toLowerCase())) list.push(item);
    groups.set(label, list);
  };
  for (const fact of profile.qualifications) add("Qualifikationen", { value: fact.value, verified: fact.source === "verified" });
  for (const fact of profile.contextEvidence) {
    const { prefix, text } = withoutPrefix(fact.value);
    const label = CONTEXT_LABELS.find(([key]) => key === prefix)?.[1] ?? "Weitere Angaben";
    add(label, { value: text, verified: fact.source === "verified" });
  }
  for (const fact of profile.contractualCapabilities) add("Vertragliches", { value: fact.value, verified: fact.source === "verified" });
  const order = ["Branchen", "Schwerpunkte", "Qualifikationen", "Zertifikate", "Erfahrung", "Vertragliches", "Weitere Angaben"];
  return order.flatMap((label) => {
    const items = groups.get(label);
    return items?.length ? [{ label, items: [...items].sort((a, b) => Number(b.verified) - Number(a.verified)) }] : [];
  });
}

export function buildProfileDossier(
  profile: FreelancerProfile,
  extras: DossierExtras,
  options: { placement: boolean },
): ProfileDossier {
  const seen = new Set<string>();
  const skills = profile.skillTags
    .flatMap((tag) => {
      const key = tag.value.trim().toLowerCase();
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ value: tag.value.trim(), verified: tag.source === "verified" }];
    })
    .sort((a, b) => Number(b.verified) - Number(a.verified));

  return {
    id: profile.id,
    displayName: profile.displayName,
    role: profile.role,
    avatarUrl: extras.avatarUrl,
    field: extras.field,
    location: profile.location?.value ?? null,
    workModes: [...profile.workModes],
    languages: profile.languages.map((language) => language.value),
    summary: profile.experienceSummary.value.trim() || null,
    referencesSummary: extras.referencesSummary?.trim() || null,
    skills,
    facts: groupFacts(profile),
    verified: profile.referenceStatus === "verified",
    verificationText: VERIFICATION_TEXT[profile.referenceStatus],
    rate: extras.rate,
    availability: {
      status: profile.availability.status,
      updatedAt: profile.availability.checkedAt,
      availableFrom: profile.availability.availableFrom,
    },
    contact: options.placement ? "request" : profile.introPolicy.bookingUrl ? "calendar" : "none",
    projects: extras.projects ?? [],
    links: extras.links ?? [],
  };
}
