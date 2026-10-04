import { roleFamilies, type RoleFamily } from "@/lib/domain/role-taxonomy";
import { canonicalSkill } from "@/lib/domain/skill-taxonomy";
import type { ProfileField } from "@/lib/profile/identity";

/**
 * In welchem Fachgebiet jemand arbeitet, für das Titelband der Karte.
 *
 * Zuerst aus der Rolle über die Rollenfamilien des Matchings, dann — wenn
 * die Rolle nichts Erkennbares sagt — aus den Skills. Bei mehreren Familien
 * gewinnt das speziellere Gebiet: Ein „KI-Fullstack-Entwickler“ steht unter
 * KI, nicht unter Softwareentwicklung. Ohne Anhaltspunkt `null`: Die Karte
 * zeigt dann ein neutrales Band statt eines geratenen Gebiets.
 */

const FAMILY_FIELD: Readonly<Record<RoleFamily, ProfileField>> = {
  ai: "ai",
  data_engineering: "data",
  data_science: "data",
  frontend: "frontend",
  mobile: "frontend",
  ux_design: "frontend",
  backend: "software",
  fullstack: "software",
  software: "software",
  architecture: "software",
  qa_test: "software",
  devops_cloud: "cloud",
  security: "cloud",
  sap: "sap",
  business_analysis: "requirements",
  project_management: "requirements",
  agile: "requirements",
  marketing: "business",
  ecommerce: "business",
  sales: "business",
  it_support: "other",
  assistance: "other",
  hr_coaching: "other",
  hardware_engineering: "other",
};

const PRIORITY: readonly ProfileField[] = [
  "ai",
  "data",
  "sap",
  "frontend",
  "cloud",
  "requirements",
  "software",
  "business",
  "other",
];

/** Kanonische Skills, die ohne Rollenwort ein Gebiet erkennen lassen. */
const SKILL_FIELD: ReadonlyArray<readonly [ProfileField, ReadonlySet<string>]> = [
  [
    "ai",
    new Set([
      "AI Agents",
      "Large Language Models",
      "RAG",
      "Azure OpenAI",
      "AI Solution Architecture",
      "AI Tooling",
      "AI Projects",
      "Microsoft Copilot",
      "Image AI",
    ]),
  ],
  ["data", new Set(["Data Analysis"])],
  ["sap", new Set(["SAP S/4HANA", "SAP MM", "SAP PP", "SAP SCM", "SAP Integration", "SAP Customizing"])],
  ["frontend", new Set(["React", "Next.js", "UX Design", "UI Design"])],
  ["cloud", new Set(["Microsoft Azure", "Docker", "Information Security"])],
  [
    "requirements",
    new Set(["Requirements Management", "Business Analysis", "Process Management", "Project Management", "User Stories"]),
  ],
  ["software", new Set(["TypeScript", "JavaScript", "Node.js", "Python", "C++", "FastAPI", "PostgreSQL", "Software Architecture"])],
];

export function profileField(role: string, skills: readonly string[]): ProfileField | null {
  const fromRole = new Set(roleFamilies(role).map((family) => FAMILY_FIELD[family]));
  const byRole = PRIORITY.find((field) => fromRole.has(field));
  if (byRole) return byRole;

  const canonical = new Set(skills.map((skill) => canonicalSkill(skill)));
  for (const [field, markers] of SKILL_FIELD) {
    for (const marker of markers) if (canonical.has(marker)) return field;
  }
  return null;
}
