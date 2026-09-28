/**
 * Rollenfamilien: welche Art von Arbeit eine Anfrage sucht und ein Profil
 * anbietet.
 *
 * Bis Regelversion v14 kannte das Matching nur Skills. Ein „SAP Engineer
 * (Joule/SAP AI)" bekam so ein Testmanagement-Profil als verlässlichen
 * Treffer, weil dort „SAP" als Skill stand. Die Rolle ist aber keine weitere
 * Fähigkeit, sondern die Frage, ob jemand diese Art von Arbeit überhaupt
 * macht.
 *
 * Die Liste ist bewusst klein, fest und regelbasiert: kein Modell, keine
 * Gewichtung, nachvollziehbar in jeder Begründung. Sie greift nur, wenn auf
 * beiden Seiten eine Familie erkennbar ist. Ein Projekttitel ohne Rollenwort
 * („KI-Automatisierung mit n8n") oder ein Profil ohne erkennbare Rolle ändert
 * nichts — fehlende Angaben sind kein Beleg gegen jemanden.
 */

export const ROLE_FAMILIES = [
  "frontend",
  "backend",
  "fullstack",
  "software",
  "mobile",
  "devops_cloud",
  "architecture",
  "security",
  "data_engineering",
  "data_science",
  "ai",
  "sap",
  "qa_test",
  "project_management",
  "agile",
  "business_analysis",
  "ux_design",
  "marketing",
  "ecommerce",
  "sales",
  "it_support",
  "assistance",
  "hr_coaching",
  "hardware_engineering",
] as const;

export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const ROLE_FAMILY_LABELS: Readonly<Record<RoleFamily, string>> = {
  frontend: "Frontend-Entwicklung",
  backend: "Backend-Entwicklung",
  fullstack: "Fullstack-Entwicklung",
  software: "Softwareentwicklung",
  mobile: "Mobile-Entwicklung",
  devops_cloud: "Cloud & DevOps",
  architecture: "Architektur",
  security: "IT-Sicherheit",
  data_engineering: "Data Engineering",
  data_science: "Data Science",
  ai: "KI",
  sap: "SAP",
  qa_test: "Test & QA",
  project_management: "Projektleitung",
  agile: "Agile & Product Ownership",
  business_analysis: "Business-Analyse & Anforderungen",
  ux_design: "UX & Design",
  marketing: "Marketing",
  ecommerce: "E-Commerce",
  sales: "Vertrieb",
  it_support: "IT-Support",
  assistance: "Assistenz",
  hr_coaching: "HR & Coaching",
  hardware_engineering: "Ingenieurwesen",
};

/**
 * Erkennungsmerkmale je Familie, auf kleingeschriebenem Text.
 *
 * Wortgrenzen sind bewusst eigene Klassen statt `\b`: `\b` kennt keine
 * Umlaute, und „KI-Berater" soll ebenso greifen wie „KI Berater".
 */
const B = "(?:^|[^\\p{L}\\p{N}])";
const E = "(?=$|[^\\p{L}\\p{N}])";

const PATTERNS: Readonly<Record<RoleFamily, RegExp>> = {
  frontend: new RegExp(
    `front-?end|${B}ui-?entwickl|${B}ui[- ]engineer|react[- ]?entwickl|react[- ]developer|react[- ]engineer|angular[- ]?entwickl|${B}vue`,
    "u",
  ),
  backend: new RegExp(
    `back-?end|${B}java[- ]?entwickl|${B}java[- ](?:developer|engineer|softwareentwicklung)|${B}\\.net${E}|${B}c#|golang|${B}php[- ]?entwickl|${B}python[- ]?entwickl|${B}python[- ]developer`,
    "u",
  ),
  fullstack: /full[- ]?stack/u,
  software: new RegExp(
    `softwareentwick|software-?engineer|software[- ]developer|software-?engineering|web-?entwickl|webentwicklung|web[- ]developer|${B}software-? ?/`,
    "u",
  ),
  mobile: new RegExp(`${B}ios${E}|android|mobile|flutter|react native|${B}maui${E}`, "u"),
  devops_cloud: new RegExp(
    `devops|mlops|${B}cloud|platform[- ]engineer|kubernetes|${B}sre${E}|site reliability|system[- ]?engineer|systemadministr|infrastruktur|infrastructure`,
    "u",
  ),
  architecture: /architekt|architect/u,
  security: new RegExp(`security|sicherheit|pentest|${B}iam${E}|${B}pam${E}|${B}isms${E}`, "u"),
  data_engineering: new RegExp(
    `data[- ]?engineer|data[- ]platform|data & ai platform|${B}etl${E}|data[- ]?warehouse|business intelligence|${B}bi${E}|datenqualität`,
    "u",
  ),
  data_science: /data[- ]?scien|data[- ]analyst|datenanaly|statisti/u,
  ai: new RegExp(
    `${B}ki${E}|${B}ai${E}|genai|gen ai|${B}llm|künstliche intelligenz|machine learning|${B}ml${E}|agentic`,
    "u",
  ),
  sap: new RegExp(`${B}sap${E}|s/4 ?hana|${B}abap${E}|successfactors`, "u"),
  qa_test: new RegExp(
    `${B}test(?:manag|ing|er|automat|analyst)?${E}|testmanag|${B}qa${E}|quality assurance|qualitätssicherung`,
    "u",
  ),
  project_management: new RegExp(
    `projektleit|projektmanag|project[- ]manag|${B}pmo${E}|projektsteuer|program(?:me)?[- ]manag|delivery (?:manag|consult|lead)`,
    "u",
  ),
  agile: new RegExp(`scrum|agile|${B}agil|product[- ]owner|business-agility`, "u"),
  business_analysis: /business[- ]analyst|requirements?[- ]engineer|anforderungs|prozessberat|prozessoptim/u,
  ux_design: new RegExp(
    `${B}ux${E}|${B}ui/ux|user experience|${B}ui[- ]design|grafik|markendesign|brand design|branding|art direction|webdesign`,
    "u",
  ),
  marketing: new RegExp(
    `marketing|${B}seo${E}|${B}sea${E}|${B}geo${E}|google ads|meta ads|paid social|content|copywriting|${B}pr${E}|influencer|linkedin|redaktion|webanalyse|tracking`,
    "u",
  ),
  ecommerce: /e-?commerce|shopify/u,
  sales: new RegExp(`vertrieb|${B}sales|${B}sdr${E}|account[- ]executive|business development`, "u"),
  it_support: new RegExp(
    `${B}it[- ]?support|support[- ]?techniker|helpdesk|service ?desk|${B}1st${E}|2nd level|onsite|on-site-? ?support`,
    "u",
  ),
  assistance: /assistenz|backoffice|executive support/u,
  // „Führung" nur als eigenes Wort: „Einführung von Microsoft" ist keine
  // Führungsrolle.
  hr_coaching: new RegExp(`${B}hr${E}|recruit|coach|leadership|${B}führung`, "u"),
  hardware_engineering: /konstrukt|elektrotechnik|maschinenbau|stationsleittechnik|baukoordinat/u,
};

/**
 * Familien, die füreinander einstehen. Symmetrisch gemeint und unten
 * symmetrisch ausgewertet.
 *
 * „Softwareentwicklung" ohne Spezialisierung passt zu jeder Entwicklerrolle,
 * „Fullstack" zu Frontend und Backend. KI, Data Science und Data Engineering
 * überschneiden sich so weit, dass sie einander nicht ausschließen.
 */
const COMPATIBLE: ReadonlyArray<readonly [RoleFamily, RoleFamily]> = [
  ["software", "frontend"],
  ["software", "backend"],
  ["software", "fullstack"],
  ["software", "mobile"],
  ["fullstack", "frontend"],
  ["fullstack", "backend"],
  ["ai", "data_science"],
  ["ai", "data_engineering"],
  ["data_science", "data_engineering"],
  ["architecture", "devops_cloud"],
  ["architecture", "software"],
  ["architecture", "backend"],
  ["architecture", "fullstack"],
  ["architecture", "data_engineering"],
  ["project_management", "agile"],
  ["project_management", "business_analysis"],
  ["marketing", "ecommerce"],
  ["ux_design", "frontend"],
];

function normalized(text: string): string {
  return text.toLocaleLowerCase("de-DE").replace(/\s+/gu, " ").trim();
}

/** Die Familien, die ein Titel erkennbar nennt, in fester Reihenfolge. */
export function roleFamilies(text: string | null | undefined): RoleFamily[] {
  if (!text) return [];
  const value = normalized(text);
  if (!value) return [];
  return ROLE_FAMILIES.filter((family) => PATTERNS[family].test(value));
}

function compatible(a: RoleFamily, b: RoleFamily): boolean {
  if (a === b) return true;
  return COMPATIBLE.some(
    ([left, right]) => (left === a && right === b) || (left === b && right === a),
  );
}

export type RoleFit =
  | { kind: "not_requested" }
  | { kind: "unknown"; requested: RoleFamily[] }
  | { kind: "match"; requested: RoleFamily[]; offered: RoleFamily[] }
  | { kind: "mismatch"; requested: RoleFamily[]; offered: RoleFamily[] };

/**
 * Passt die Rolle eines Profils zur gesuchten?
 *
 * - `not_requested`: Der Titel nennt keine erkennbare Rolle. Nichts ändert sich.
 * - `unknown`: Gesucht ist eine Rolle, das Profil nennt keine erkennbare.
 *   Kein Beleg dagegen, also ebenfalls keine Wirkung.
 * - `match`: Mindestens eine angebotene Familie passt zu einer gesuchten.
 * - `mismatch`: Beide Seiten sind erkennbar, und keine Familie passt.
 */
export function roleFit(
  requestedTitle: string | null | undefined,
  offeredRole: string | null | undefined,
): RoleFit {
  const requested = roleFamilies(requestedTitle);
  if (requested.length === 0) return { kind: "not_requested" };
  const offered = roleFamilies(offeredRole);
  if (offered.length === 0) return { kind: "unknown", requested };
  const passt = requested.some((wanted) =>
    offered.some((given) => compatible(wanted, given)),
  );
  return passt
    ? { kind: "match", requested, offered }
    : { kind: "mismatch", requested, offered };
}

export function roleFamilyLabels(families: readonly RoleFamily[]): string {
  return families.map((family) => ROLE_FAMILY_LABELS[family]).join(", ");
}
