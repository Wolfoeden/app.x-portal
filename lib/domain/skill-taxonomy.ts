/**
 * Reviewed vocabulary shared by extraction, grounding and deterministic
 * matching. Aliases express spelling/terminology equivalence only; they must
 * never infer a product or competence that the source text did not name.
 */
export type SkillDefinition = {
  canonical: string;
  aliases: readonly string[];
};

export const SKILL_TAXONOMY: readonly SkillDefinition[] = [
  {
    canonical: "Requirements Management",
    aliases: [
      "requirements management",
      "requirements engineering",
      "requirements analysis",
      "anforderungsmanagement",
      "anforderungsanalyse",
      "anforderungserhebung",
      "anforderungsklärung",
      "anforderungsklaerung",
      "fachliche anforderungen",
    ],
  },
  {
    canonical: "Process Management",
    aliases: [
      "process management",
      "process analysis",
      "process optimization",
      "process improvement",
      "process modelling",
      "continuous improvement",
      "process development",
      "prozessmanagement",
      "prozessanalyse",
      "geschäftsprozessanalyse",
      "geschaeftsprozessanalyse",
      "geschäftsprozessgestaltung",
      "geschaeftsprozessgestaltung",
      "geschäftsprozessoptimierung",
      "geschaeftsprozessoptimierung",
      "prozessoptimierung",
      "prozessmodellierung",
      "prozessverbesserung",
      "kontinuierliche verbesserung",
    ],
  },
  {
    canonical: "Business Analysis",
    aliases: [
      "business analysis",
      "business analyst",
      "business engineering",
      "business engineer",
      "fachanalyse",
    ],
  },
  {
    canonical: "Functional Architecture",
    aliases: [
      "functional architecture",
      "functional architecture management",
      "funktionale architektur",
      "funktionales architekturmanagement",
      "funktionalen architekturmanagement",
    ],
  },
  {
    canonical: "SAFe",
    aliases: ["safe", "scaled agile framework", "safe-vorgehensmodell", "safe vorgehensmodell"],
  },
  {
    canonical: "Stakeholder Management",
    aliases: [
      "stakeholder management",
      "stakeholder-management",
      "stakeholder interviews",
      "stakeholder-interviews",
      "stakeholder workshops",
      "stakeholder-workshops",
      "stakeholder communication",
      "stakeholderkommunikation",
    ],
  },
  {
    canonical: "User Stories",
    aliases: [
      "user stories",
      "user story",
      "epics",
      "epics und features",
      "epics, features und user stories",
    ],
  },
  {
    canonical: "Acceptance Criteria & Test Cases",
    aliases: [
      "acceptance criteria",
      "akzeptanzkriterien",
      "test cases",
      "functional test cases",
      "fachliche testfälle",
      "fachliche testfaelle",
      "testfallerstellung",
    ],
  },
  {
    canonical: "Risk Management",
    aliases: [
      "risk management",
      "risk assessment",
      "risikomanagement",
      "risikobewertung",
    ],
  },
  {
    canonical: "Data Analysis",
    aliases: [
      "data analysis",
      "exploratory data analysis",
      "datenanalyse",
      "datenanalysen",
      "explorative datenanalyse",
      "explorative datenanalysen",
    ],
  },
  {
    canonical: "Project Management",
    aliases: [
      "project management",
      "technical project management",
      "salesforce project management",
      "agile project management",
      "project coordination",
      "program management",
      "project leadership",
      "projektmanagement",
      "projektleitung",
      "technisches projektmanagement",
      "agiles projektmanagement",
      "programmmanagement",
      "projektkoordination",
    ],
  },
  {
    canonical: "Information Security",
    aliases: [
      "information security",
      "it security",
      "cybersecurity",
      "cyber security",
      "isms",
      "informationssicherheit",
      "it-sicherheit",
      "it sicherheit",
      "cybersicherheit",
      "informationssicherheitsmanagement",
    ],
  },
  {
    canonical: "SAP S/4HANA",
    aliases: ["sap s/4hana", "s/4hana", "sap s4hana", "s4hana", "sap s/4 hana"],
  },
  {
    canonical: "SAP MM",
    aliases: [
      "sap mm",
      "sap material management",
      "sap materials management",
      "sap materialwirtschaft",
    ],
  },
  {
    canonical: "SAP PP",
    aliases: ["sap pp", "sap production planning", "sap produktionsplanung"],
  },
  {
    canonical: "SAP SCM",
    aliases: ["sap scm", "sap supply chain management"],
  },
  {
    canonical: "SAP Integration",
    aliases: [
      "sap integration",
      "sap integrations",
      "sap-integrationen",
      "sap interfaces",
      "sap schnittstellen",
      "sap-schnittstellen",
    ],
  },
  {
    canonical: "SAP Customizing",
    aliases: [
      "sap customizing",
      "sap customising",
      "sap configuration",
      "sap konfiguration",
      "customizing",
    ],
  },
  {
    canonical: "Software Architecture",
    aliases: [
      "software architecture",
      "software architect",
      "software-architektur",
      "softwarearchitektur",
      "softwarearchitekt",
      "software-architekt",
    ],
  },
  {
    canonical: "AI Solution Architecture",
    aliases: [
      "ai solution architecture",
      "ai solution architect",
      "ai architecture",
      "ai architect",
      "ki-architektur",
      "ki architektur",
    ],
  },
  {
    canonical: "Azure AI",
    aliases: ["azure ai", "azure ai engineer", "microsoft azure ai"],
  },
  {
    canonical: "Microsoft Copilot",
    aliases: ["microsoft copilot", "microsoft copilot developer", "copilot studio"],
  },
  {
    canonical: "AI Projects",
    aliases: ["ai projects", "ai project delivery", "ki-projekte", "ki projekte", "ki-projekten"],
  },
  {
    canonical: "AI Training",
    aliases: [
      "ai training",
      "ai-training",
      "ai_training",
      "ki training",
      "ki-training",
      "ki_training_center",
      "ki weiterbildung",
      "ki-weiterbildung",
      "ki weiterbildungen",
      "ki-weiterbildungen",
      "ki trainer",
      "ki-trainer",
      "ki dozent",
      "ki-dozent",
      "ki dozierende",
      "ki-dozierende",
    ],
  },
  {
    canonical: "AI Tooling",
    aliases: [
      "ai tooling",
      "ai tools",
      "ai-tools",
      "ki tooling",
      "ki tools",
      "ki-tools",
      "tool exploration",
      "tool_exploration",
      "automatisierungstools",
      "automation tools",
    ],
  },
  {
    canonical: "Large Language Models",
    aliases: [
      "large language models",
      "large language model",
      "llms",
      "llm",
      "sprachmodelle",
      "große sprachmodelle",
      "grosse sprachmodelle",
    ],
  },
  {
    canonical: "Image AI",
    aliases: [
      "image ai",
      "image generation ai",
      "bild ki",
      "bild-ki",
      "bild_ki",
      "ki bildgenerierung",
      "ki-bildgenerierung",
    ],
  },
  {
    canonical: "Didactics",
    aliases: [
      "didactics",
      "didaktik",
      "teaching",
      "lehre",
      "dozententätigkeit",
      "dozententaetigkeit",
      "schulungstage",
      "schulungsgruppen",
      "schulungsmaterialien",
      "eigenständige vorbereitung und individuelle anpassung an gruppen",
      "eigenstaendige vorbereitung und individuelle anpassung an gruppen",
      "fähigkeit zur eigenständigen vorbereitung und individuellen anpassung an gruppen",
      "faehigkeit zur eigenstaendigen vorbereitung und individuellen anpassung an gruppen",
    ],
  },
  {
    canonical: "Document Analysis",
    aliases: [
      "document analysis",
      "document intelligence",
      "document processing",
      "dokumentenanalyse",
      "dokumentenverarbeitung",
      "dokumentenanalyse-verfahren",
    ],
  },
  {
    canonical: "RAG",
    aliases: [
      "rag",
      "rag system",
      "rag systems",
      "rag-system",
      "rag-systeme",
      "rag-systemen",
      "retrieval augmented generation",
    ],
  },
  {
    canonical: "Microsoft 365",
    aliases: [
      "microsoft 365",
      "m365",
      "office 365",
      "microsoft-365",
      "microsoft-365-umfeld",
      "microsoft-365-umgebung",
    ],
  },
  {
    canonical: "Enterprise Applications",
    aliases: ["enterprise applications", "enterprise software", "unternehmensanwendungen"],
  },
  {
    canonical: "Business Process Automation",
    aliases: [
      "business process automation",
      "process automation",
      "workflow automation",
      "automatisierung von geschäftsprozessen",
      "automatisierung von geschaeftsprozessen",
      "power automate",
      "geschäftsprozessautomatisierung",
      "geschaeftsprozessautomatisierung",
      "prozessautomatisierung",
    ],
  },
  { canonical: "React", aliases: ["react", "react development", "react-entwicklung"] },
  { canonical: "TypeScript", aliases: ["typescript", "type script"] },
  { canonical: "JavaScript", aliases: ["javascript", "java script"] },
  { canonical: "Node.js", aliases: ["node.js", "nodejs", "node js"] },
  { canonical: "Next.js", aliases: ["next.js", "nextjs", "next js"] },
  { canonical: "Python", aliases: ["python", "python developer", "python entwickler"] },
  { canonical: "C++", aliases: ["c++", "cpp"] },
  { canonical: "FastAPI", aliases: ["fastapi", "fastapi developer", "fastapi entwickler"] },
  { canonical: "PostgreSQL", aliases: ["postgresql", "postgres", "postgres sql"] },
  { canonical: "Microsoft Azure", aliases: ["microsoft azure", "azure"] },
  { canonical: "Azure OpenAI", aliases: ["azure openai"] },
  { canonical: "Microsoft Graph", aliases: ["microsoft graph"] },
  { canonical: "SharePoint", aliases: ["sharepoint"] },
  { canonical: "Docker", aliases: ["docker"] },
  { canonical: "UX Design", aliases: ["ux design", "ux-design", "user experience design"] },
  { canonical: "UI Design", aliases: ["ui design", "ui-design", "interface design"] },
] as const;

export function normalizeSkill(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ");
}

export function skillDefinition(value: string): SkillDefinition | null {
  const key = normalizeSkill(value);
  return (
    SKILL_TAXONOMY.find(
      (definition) =>
        normalizeSkill(definition.canonical) === key ||
        definition.aliases.some((alias) => normalizeSkill(alias) === key),
    ) ?? null
  );
}

export function canonicalSkill(value: string): string {
  return skillDefinition(value)?.canonical ?? value.trim();
}

export function skillFamilyKey(value: string): string | null {
  const definition = skillDefinition(value);
  return definition ? normalizeSkill(definition.canonical) : null;
}

export function skillTerms(value: string): readonly string[] {
  const definition = skillDefinition(value);
  return definition
    ? [...new Set([definition.canonical, ...definition.aliases])]
    : [value];
}

export const DEFAULT_SKILL_CATALOG = SKILL_TAXONOMY.map(
  (definition) => definition.canonical,
);

export const DEFAULT_SKILL_ALIASES: Readonly<Record<string, readonly string[]>> =
  Object.fromEntries(
    SKILL_TAXONOMY.map((definition) => [
      definition.canonical,
      definition.aliases.filter(
        (alias) => normalizeSkill(alias) !== normalizeSkill(definition.canonical),
      ),
    ]),
  );
