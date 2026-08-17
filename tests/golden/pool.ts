/**
 * Golden-set profile pool.
 *
 * Deliberately synthetic. The pool mirrors the shape and the edge-case
 * distribution of the real `freelancer_profiles` table (measured 2026-08-13 on
 * a 65-row export) without committing personal data of real freelancers into
 * the repository and its history.
 *
 * Distribution reproduced from that export:
 * - availability is `unknown` for the large majority, `available` is rare
 * - `verified` facts are rare; most rows are entirely self-reported
 * - a long tail of thin consultant profiles carries only two or three tags
 * - profiles carry category metadata (Industry / Certification / Experience /
 *   Qualification) that `searchableSkillTags` strips before matching. It is
 *   kept here in `metadata` so the context-evidence work can consume it
 *   without the pool having to be rewritten.
 * - archived, demo, unavailable and missing-booking-url rows exist and must be
 *   filtered out by eligibility, not by the fixture.
 */

import { type FreelancerProfile, FreelancerProfileSchema } from "../../lib/domain";

const verified = (value: string) => ({ value, source: "verified" as const });
const selfReported = (value: string) => ({ value, source: "self_reported" as const });

export type GoldenProfile = {
  readonly profile: FreelancerProfile;
  /** Category-prefixed facts that `searchableSkillTags` strips today. */
  readonly metadata: readonly string[];
};

type PoolInput = {
  id: string;
  name: string;
  role: string;
  skills: readonly string[];
  metadata?: readonly string[];
  languages?: readonly string[];
  location?: string | null;
  workModes?: readonly ("remote" | "on_site" | "hybrid")[];
  experience: string;
  availability?: "available" | "limited" | "unavailable" | "unknown";
  availableFrom?: string | null;
  profileStatus?: "active" | "paused" | "archived";
  demoStatus?: "demo" | "real";
  bookingUrl?: string | null;
  verifiedSkills?: readonly string[];
};

const build = (input: PoolInput): GoldenProfile => ({
  profile: FreelancerProfileSchema.parse({
    id: input.id,
    dataVersion: "golden-2026-08-13.1",
    demoStatus: input.demoStatus ?? "real",
    profileStatus: input.profileStatus ?? "active",
    displayName: input.name,
    role: input.role,
    skillTags: input.skills.map((skill) =>
      input.verifiedSkills?.includes(skill) ? verified(skill) : selfReported(skill),
    ),
    languages: (input.languages ?? ["German"]).map(selfReported),
    location: input.location === null ? null : selfReported(input.location ?? "Germany"),
    workModes: input.workModes ?? ["remote"],
    experienceSummary: { value: input.experience, source: "self_reported" as const },
    qualifications: [],
    contractualCapabilities: [],
    referenceStatus: "self_reported",
    hourlyRate: null,
    dayRate: null,
    minimumProjectBudget: null,
    availability: {
      status: input.availability ?? "unknown",
      availableFrom: input.availableFrom ?? null,
      checkedAt: "2026-08-09T18:29:15.925Z",
    },
    introPolicy: {
      type: "premium",
      label: "Kontakt nach manueller Freigabe",
      bookingUrl:
        input.bookingUrl === null
          ? null
          : (input.bookingUrl ?? "https://calendly.com/example/intro30"),
    },
  }),
  metadata: input.metadata ?? [],
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const goldenPool: readonly GoldenProfile[] = [
  // --- 1. Technical requirements engineer, mobility-adjacent, metadata-heavy.
  // The archetype that loses the most information to `searchableSkillTags`.
  build({
    id: uuid(1),
    name: "Tomas Brandt",
    role: "Interim Engineering Manager",
    skills: [
      "requirements management",
      "systems engineering",
      "SysML",
      "functional safety",
      "embedded systems",
      "process development",
      "scrum",
      "kanban",
      "change management",
      "technical project management",
    ],
    metadata: [
      "Industry: ECU development",
      "Industry: alternative drives",
      "Industry: aerospace and defence",
      "Industry: safety-critical systems",
      "Certification: System Requirements Engineering",
      "Certification: Functional Safety SIL",
      "Certification: IPMA Level B",
      "Experience: interim engineering management",
      "Experience: electronics and embedded project management",
    ],
    languages: ["German", "English"],
    experience:
      "Interim engineering manager for embedded and safety-critical development, teams up to 45 people.",
    availability: "available",
    workModes: ["remote", "hybrid", "on_site"],
  }),

  // --- 2. Classic business analyst / IT project manager, finance-flavoured.
  build({
    id: uuid(2),
    name: "Clemens Grothe",
    role: "Business Analyst & IT Project Manager",
    skills: [
      "business analysis",
      "requirements management",
      "project management",
      "process analysis",
      "stakeholder management",
      "test management",
      "risk assessment",
      "interface design",
      "change management",
    ],
    metadata: [
      "Experience: SAP R/3 to S/4HANA migration",
      "Experience: e-invoicing implementation",
      "Certification: Professional Scrum Master I",
      "Certification: Professional Scrum Product Owner I",
    ],
    languages: ["German", "English"],
    experience: "Business analyst and IT project manager for finance and ERP programmes.",
    workModes: ["remote", "hybrid"],
  }),

  // --- 3. Requirements + data analysis. The only archetype covering
  // exploratory data analysis alongside requirements work.
  build({
    id: uuid(3),
    name: "Bettina Kolb",
    role: "AI Manager & Digital Transformation Expert",
    skills: [
      "requirements management",
      "system analysis",
      "process modelling",
      "business intelligence",
      "big data",
      "test management",
      "quality assurance",
      "project management",
      "agile delivery",
    ],
    metadata: [
      "Industry: public administration",
      "Industry: telecommunications",
      "Qualification: Master of Science in Computer Science",
      "Experience: business intelligence and big data",
    ],
    languages: ["German", "English"],
    experience: "Digital transformation lead with a business intelligence and data background.",
    workModes: ["remote", "hybrid"],
  }),

  // --- 4. The keyword winner with the wrong engagement scope. Matches the most
  // required skills including SAFe, but operates at org-transformation level.
  build({
    id: uuid(4),
    name: "Marek Lindner",
    role: "Business Agility Transformation Leader",
    skills: [
      "business agility",
      "SAFe",
      "requirements management",
      "process analysis",
      "change management",
      "agile coaching",
      "program management",
      "organizational development",
      "strategic planning",
      "continuous improvement",
    ],
    metadata: [
      "Experience: transformation programs for 1000+ employee units",
      "Experience: large-scale business agility transformation",
      "Certification: Enterprise Kanban Coach",
    ],
    languages: ["German", "English"],
    experience:
      "Transformation leader for business agility programmes across units of more than 1000 employees.",
    workModes: ["remote", "hybrid"],
  }),

  // --- 5. Test manager who only surfaces because "SAFe" appears literally.
  // This is the false positive the German-language brief produces today.
  build({
    id: uuid(5),
    name: "Gregor Feld",
    role: "Test Management / QA",
    skills: ["ISTQB", "IREB", "Tosca", "Selenium", "SAFe", "scrum", "test automation"],
    languages: ["German"],
    experience: "Test manager and QA lead for enterprise rollouts.",
  }),

  // --- 6-9. The long tail: thin consultant profiles with two or three tags.
  build({
    id: uuid(6),
    name: "Marius Stahl",
    role: "Growth Strategy & Requirements Management Consultant",
    skills: ["growth strategy", "requirements management"],
    experience: "Consultant focused on growth strategy and requirements management.",
  }),
  build({
    id: uuid(7),
    name: "Damian Zaher",
    role: "AI Systems & Requirements Management Consultant",
    skills: ["requirements management", "AI systems", "digitalization"],
    metadata: ["Industry: regulated industries"],
    experience: "Consultant for AI systems and requirements management.",
  }),
  build({
    id: uuid(8),
    name: "Simona Dörr",
    role: "Digitalization & Requirements Management Consultant",
    skills: ["digitalization", "requirements management"],
    experience: "Consultant for digitalization and requirements management.",
  }),
  build({
    id: uuid(9),
    name: "Silas Pawel",
    role: "IT Architecture & Requirements Management Consultant",
    skills: ["IT architecture", "requirements management"],
    experience: "Consultant for IT architecture and requirements management.",
  }),

  // --- 10. Requirements analyst with the closest task-level fit, but the
  // profile is thin on the technical side.
  build({
    id: uuid(10),
    name: "Sonja Merz",
    role: "Requirements & Business Analyst",
    skills: [
      "requirements management",
      "business analysis",
      "bpmn",
      "stakeholder workshops",
      "acceptance criteria",
      "process analysis",
    ],
    languages: ["German", "English"],
    experience: "Business analyst for requirements elicitation and process design.",
    availability: "limited",
    workModes: ["remote", "hybrid"],
  }),

  // --- 11. One of the few profiles with verified facts. Guards the
  // verification ordering criterion against regressions once data exists.
  build({
    id: uuid(11),
    name: "Ruth Sanders",
    role: "Requirements Engineering Consultant",
    skills: ["requirements engineering", "process analysis", "stakeholder workshops"],
    verifiedSkills: ["requirements engineering", "process analysis"],
    languages: ["German", "English"],
    experience: "Requirements engineering consultant with operator-verified references.",
    workModes: ["remote", "hybrid"],
  }),

  // --- 12-15. Irrelevant noise. Must never enter a requirements shortlist.
  build({
    id: uuid(12),
    name: "Pia Lehnert",
    role: "Google Ads",
    skills: ["Google Ads", "conversion tracking", "keyword research", "WordPress"],
    experience: "Performance marketer for search campaigns.",
  }),
  build({
    id: uuid(13),
    name: "Florentin Huch",
    role: "Art Direction / Brand Design",
    skills: ["brand design", "editorial", "screen design", "webdesign"],
    experience: "Art director for brand and editorial design.",
  }),
  build({
    id: uuid(14),
    name: "Anneke Pachot",
    role: "Virtual Assistance / Executive Support",
    skills: ["event planning", "data entry", "customer service", "scheduling"],
    experience: "Executive assistant and back office support.",
  }),
  build({
    id: uuid(15),
    name: "Nikolas Petrich",
    role: "Software / AI Engineering",
    skills: ["react", "angular", "python", "c#", "cloud", "LLM", "automation"],
    languages: ["German", "English"],
    experience: "Full stack and AI engineer.",
  }),

  // --- 16-19. Eligibility edge cases. Each must be rejected for exactly one
  // reason, so a regression in one filter cannot hide behind another.
  build({
    id: uuid(16),
    name: "Archivierte Person",
    role: "Requirements Management Consultant",
    skills: ["requirements management", "process analysis"],
    profileStatus: "archived",
    experience: "Archived profile that must never appear.",
  }),
  build({
    id: uuid(17),
    name: "Demo Person",
    role: "Requirements Management Consultant",
    skills: ["requirements management", "process analysis"],
    demoStatus: "demo",
    experience: "Demo profile that must never appear.",
  }),
  build({
    id: uuid(18),
    name: "Nicht Verfuegbar",
    role: "Requirements Management Consultant",
    skills: ["requirements management", "process analysis"],
    availability: "unavailable",
    experience: "Unavailable profile that must never appear.",
  }),
  build({
    id: uuid(19),
    name: "Ohne Booking Link",
    role: "Requirements Management Consultant",
    skills: ["requirements management", "process analysis"],
    bookingUrl: null,
    experience: "Profile without a booking link that must never appear.",
  }),

  // --- 20. German-only speaker without English, on-site only. Exercises the
  // language and work-mode filters from the opposite direction.
  build({
    id: uuid(20),
    name: "Ortsgebundener Analyst",
    role: "Business Analyst",
    skills: ["business analysis", "requirements management", "process analysis"],
    languages: ["German"],
    location: "München",
    workModes: ["on_site"],
    experience: "Business analyst working on site in the Munich area only.",
  }),

  // --- 21. Synthetic version of the production AI-trainer archetype. Raw
  // snake_case tags deliberately mirror the catalogue format without storing
  // a real freelancer's name or contact data in repository history.
  build({
    id: uuid(21),
    name: "KI-Trainingsberater",
    role: "KI Training & Schulungsmaterialien",
    skills: [
      "ai_training",
      "ki_training_center",
      "ai_consulting",
      "aevo",
      "prozessautomatisierung",
      "didaktik",
      "information_design",
      "präsentationen",
      "schulungsmaterialien",
      "tool_exploration",
      "bild_ki",
    ],
    experience:
      "KI-Trainer mit Erfahrung in Prozessautomatisierung, Tool-Erprobung, Informationsdesign und Schulungsmaterialien.",
    availability: "available",
    workModes: ["remote"],
  }),
];

export const goldenProfiles: readonly FreelancerProfile[] = goldenPool.map((entry) => entry.profile);

export const goldenProfileName = (id: string): string =>
  goldenProfiles.find((profile) => profile.id === id)?.displayName ?? id;
