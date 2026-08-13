import {
  type Currency,
  type MoneyRange,
  type ProjectBrief,
  type ProjectDuration,
  type RateRange,
  type StartWindow,
  ProjectBriefSchema,
  deriveUnknownFields,
} from "./brief";

const DEFAULT_SKILL_CATALOG = [
  "React",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Next.js",
  "Python",
  "SAP S/4HANA",
  "SAP MM",
  "SAP PP",
  "SAP SCM",
  "SAP Customizing",
  "SAP Integration",
  "Project Management",
  "Requirements Management",
  "Process Management",
  "Information Security",
  "Cybersecurity",
  "UX Design",
  "UI Design",
] as const;

const DEFAULT_SKILL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "SAP S/4HANA": ["s/4hana", "sap s4hana"],
  "SAP Customizing": ["customizing", "sap customizing"],
  "SAP Integration": ["sap integration", "sap-integrationen", "schnittstellen"],
  "Project Management": ["projektmanagement", "projektleitung"],
  "Requirements Management": [
    "anforderungsmanagement",
    "anforderungsanalyse",
    "requirements engineering",
  ],
  "Process Management": ["prozessmanagement", "prozessoptimierung"],
  "Information Security": [
    "informationssicherheit",
    "it-sicherheit",
    "isms",
  ],
  Cybersecurity: ["cybersicherheit", "cyber security"],
  "UX Design": ["ux-design", "user experience design"],
  "UI Design": ["ui-design", "interface design"],
};

const DEFAULT_LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  deutsch: "German",
  german: "German",
  englisch: "English",
  english: "English",
  französisch: "French",
  french: "French",
  spanisch: "Spanish",
  spanish: "Spanish",
};

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  ein: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
};

export interface FallbackParserOptions {
  now?: Date;
  skillCatalog?: readonly string[];
  languageAliases?: Readonly<Record<string, string>>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalList(values: readonly string[]): string[] | null {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLocaleLowerCase("en-US");
    if (value && !seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result.length ? result : null;
}

function parseSkills(
  text: string,
  catalog: readonly string[],
): { required: string[] | null; optional: string[] | null } {
  const required: string[] = [];
  const optional: string[] = [];

  for (const skill of catalog) {
    const match = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(skill)}(?:$|[^\\p{L}\\p{N}])`, "iu").exec(text);
    if (!match || match.index === undefined) continue;

    const prefix = text.slice(Math.max(0, match.index - 55), match.index);
    if (/(?:nice[ -]to[ -]have|optional(?:ly)?|ideally|wünschenswert|optional)\s*[:,-]?\s*$/iu.test(prefix)) {
      optional.push(skill);
    } else {
      required.push(skill);
    }
  }

  for (const [canonical, aliases] of Object.entries(DEFAULT_SKILL_ALIASES)) {
    if (!catalog.some((skill) => skill === canonical)) continue;
    for (const alias of aliases) {
      const match = new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${escapeRegex(alias)}(?:$|[^\\p{L}\\p{N}])`,
        "iu",
      ).exec(text);
      if (!match || match.index === undefined) continue;

      const prefix = text.slice(Math.max(0, match.index - 55), match.index);
      if (
        /(?:nice[ -]to[ -]have|optional(?:ly)?|ideally|wünschenswert|optional)\s*[:,-]?\s*$/iu.test(
          prefix,
        )
      ) {
        optional.push(canonical);
      } else {
        required.push(canonical);
      }
      break;
    }
  }

  return { required: canonicalList(required), optional: canonicalList(optional) };
}

function parseLanguage(
  text: string,
  aliases: Readonly<Record<string, string>>,
): string | null {
  for (const [alias, canonical] of Object.entries(aliases)) {
    const escaped = escapeRegex(alias);
    const explicitPatterns = [
      `\\bin\\s+${escaped}\\b`,
      `\\bspeaks?\\s+${escaped}\\b`,
      `\\b(?:language|sprache|sprachlich)\\s*(?::|=)?\\s*${escaped}\\b`,
      `\\b${escaped}(?:[- ]speaking|sprachig(?:e[rmns]?)?)\\b`,
      `\\b${escaped}\\s+(?:speaker|sprachkenntnisse)\\b`,
      `\\b${escaped}\\b(?=\\s*[,;.]|\\s*$)`,
    ];
    if (new RegExp(explicitPatterns.join("|"), "iu").test(text)) return canonical;
  }
  return null;
}

function parseWorkMode(text: string): ProjectBrief["workMode"] {
  const remote = /\b(?:remote|remotely|homeoffice|home office)\b/iu.test(text);
  const onsite = /\b(?:on[ -]?site|vor ort|onsite)\b/iu.test(text);
  const hybrid = /\bhybrid\b/iu.test(text);
  if (hybrid || (remote && onsite)) return "hybrid";
  if (remote) return "remote";
  if (onsite) return "on_site";
  return "unknown";
}

function parseLocation(text: string): string | null {
  const labeled = /(?:\blocation|\bstandort|\bort)\s*[:=]\s*([\p{L}][\p{L} .'-]{1,80})(?=,|;|\.|\n|$)/iu.exec(text);
  if (labeled?.[1]) return labeled[1].trim();

  const onsite = /\b(?:on[ -]?site|vor ort|onsite)\s+(?:in|at)\s+([\p{L}][\p{L} '-]{1,80}?)(?=\s+(?:for|für)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|ein|eine|einen|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)\b|,|;|\.|\n|$)/iu.exec(text);
  return onsite?.[1]?.trim() || null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseStartWindow(text: string, now: Date): StartWindow | null {
  const nextMonth = /\b(?:next month|nächsten monat|kommenden monat)\b/iu.exec(text);
  if (nextMonth?.[0]) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const first = new Date(Date.UTC(year, month + 1, 1));
    const last = new Date(Date.UTC(year, month + 2, 0));
    return { raw: nextMonth[0], earliest: toIsoDate(first), latest: toIsoDate(last) };
  }

  const iso = /(?:\bstart(?:ing)?|\bab|\bstart)\s*(?:on|am|:)?\s*(\d{4}-\d{2}-\d{2})\b/iu.exec(text);
  if (iso?.[1]) {
    return { raw: iso[0], earliest: iso[1], latest: iso[1] };
  }

  const immediate = /\b(?:asap|immediately|sofort|schnellstmöglich)\b/iu.exec(text);
  if (immediate?.[0]) {
    const today = toIsoDate(now);
    return { raw: immediate[0], earliest: today, latest: today };
  }
  return null;
}

function parseNumericToken(value: string): number | null {
  const normalized = value.toLocaleLowerCase("de-DE");
  if (NUMBER_WORDS[normalized] !== undefined) return NUMBER_WORDS[normalized];
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseDuration(text: string): ProjectDuration | null {
  const match = /(?:\bfor|\bfür|\bdauer\s*[:=]?|\bdauert?)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|ein|eine|einen|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)\s*(hours?|stunden?|days?|tage?n?|weeks?|wochen?|months?|monate?n?)\b/iu.exec(text);
  if (!match?.[1] || !match[2]) return null;
  const value = parseNumericToken(match[1]);
  if (value === null) return null;
  const rawUnit = match[2].toLocaleLowerCase("de-DE");
  const unit: ProjectDuration["unit"] =
    /^(?:hour|stund)/u.test(rawUnit)
      ? "hours"
      : /^(?:day|tag)/u.test(rawUnit)
        ? "days"
        : /^(?:week|woch)/u.test(rawUnit)
          ? "weeks"
          : "months";
  return { raw: match[0], value, unit };
}

function currencyFromToken(token: string): Currency | null {
  const normalized = token.toUpperCase();
  if (normalized === "€" || normalized === "EUR") return "EUR";
  if (normalized === "$" || normalized === "USD") return "USD";
  if (normalized === "£" || normalized === "GBP") return "GBP";
  return null;
}

function parseAmount(raw: string): number | null {
  const compact = raw.replace(/\s/g, "");
  const decimalSeparator = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
  const normalized = decimalSeparator === ","
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function isInstructionToInvent(prefix: string): boolean {
  return /(?:invent|guess|assume|default|erfind|rate|schätz|nimm einfach)\s*(?:a|an|the|ein(?:e|en)?)?\s*$/iu.test(prefix);
}

function parseBudget(text: string): MoneyRange | null {
  const pattern = /\b(?:project\s+)?budget\s*(?:is|of|:|=|bis|max(?:imum)?|up to)?\s*(€|EUR|\$|USD|£|GBP)?\s*([0-9][0-9., ]*)(?:\s*(?:-|to|bis)\s*(€|EUR|\$|USD|£|GBP)?\s*([0-9][0-9., ]*))?\s*(€|EUR|\$|USD|£|GBP)?\b/iu;
  const match = pattern.exec(text);
  if (!match?.[2] || match.index === undefined) return null;
  if (isInstructionToInvent(text.slice(Math.max(0, match.index - 35), match.index))) return null;

  const currency = currencyFromToken(match[1] || match[3] || match[5] || "");
  const first = parseAmount(match[2]);
  const second = match[4] ? parseAmount(match[4]) : null;
  if (currency === null || first === null) return null;
  const hasMaxQualifier = /(?:bis|max(?:imum)?|up to)/iu.test(match[0]);
  return second === null
    ? { min: hasMaxQualifier ? null : first, max: first, currency }
    : { min: Math.min(first, second), max: Math.max(first, second), currency };
}

function parseRate(text: string): RateRange | null {
  const labeledPattern = /\b(max(?:imal)?(?:e[rmns]?)?\s+)?(stundensatz|tagessatz)\s*(?:beträgt|ist|von|:|=|bis|up to)?\s*(?:(€|EUR|\$|USD|£|GBP)\s*([0-9][0-9., ]*)|([0-9][0-9., ]*)\s*(€|EUR|\$|USD|£|GBP))\b/iu;
  const labeled = labeledPattern.exec(text);
  if (labeled?.[2] && labeled.index !== undefined) {
    if (isInstructionToInvent(text.slice(Math.max(0, labeled.index - 35), labeled.index))) {
      return null;
    }
    const currency = currencyFromToken(labeled[3] || labeled[6] || "");
    const amount = parseAmount(labeled[4] || labeled[5] || "");
    if (currency !== null && amount !== null) {
      return {
        min: labeled[1] ? null : amount,
        max: amount,
        currency,
        unit: /^stundensatz$/iu.test(labeled[2]) ? "hour" : "day",
      };
    }
  }

  const pattern = /(?:\brate|\bstundensatz|\btagessatz|\bhourly|\bdaily)?\s*(?:is|of|:|=|bis|max(?:imum)?|up to)?\s*(€|EUR|\$|USD|£|GBP)\s*([0-9][0-9., ]*)(?:\s*(?:-|to|bis)\s*(€|EUR|\$|USD|£|GBP)?\s*([0-9][0-9., ]*))?\s*(?:per|\/|pro)\s*(hour|hr|stunde|tag|day)\b/iu;
  const match = pattern.exec(text);
  if (!match?.[2] || !match[5] || match.index === undefined) return null;
  if (isInstructionToInvent(text.slice(Math.max(0, match.index - 35), match.index))) return null;
  const currency = currencyFromToken(match[1] || match[3] || "");
  const first = parseAmount(match[2]);
  const second = match[4] ? parseAmount(match[4]) : null;
  if (currency === null || first === null) return null;
  const unit = /^(?:hour|hr|stunde)$/iu.test(match[5]) ? "hour" : "day";
  const hasMaxQualifier = /(?:bis|max(?:imum)?|up to)/iu.test(match[0]);
  return second === null
    ? { min: hasMaxQualifier ? null : first, max: first, currency, unit }
    : { min: Math.min(first, second), max: Math.max(first, second), currency, unit };
}

function parseLabeledList(text: string, labels: readonly string[]): string[] | null {
  const expression = new RegExp(
    `(?:${labels.map(escapeRegex).join("|")})\\s*[:=]\\s*([^\\n.]+)`,
    "iu",
  );
  const value = expression.exec(text)?.[1];
  if (!value) return null;
  return canonicalList(value.split(/[,;]/u));
}

function contractualConstraints(values: string[] | null): string[] | null {
  if (!values) return null;
  return canonicalList(
    values.filter((value) =>
      /(?:\bresiden(?:cy|t)|\bwohn(?:sitz|haft)|\bnda\b|\bconfidentiality\b|\bvertraulichkeit|\binvoic(?:e|ing)|\brechnung(?:sfähig|sstellung)?|\bwork\s*(?:permit|authorization)|\barbeitserlaubnis|\bcitizenship|\bstaatsbürgerschaft|\bsecurity\s+clearance|\bsicherheitsüberprüfung)/iu.test(
        value,
      ),
    ),
  );
}

/**
 * Conservative, deterministic recovery path for provider failures. It extracts
 * only explicit, recognizable facts and keeps every other field null/unknown.
 */
export function parseFallbackBrief(
  originalRequest: string,
  options: FallbackParserOptions = {},
): ProjectBrief {
  if (!originalRequest.trim()) throw new Error("The original request cannot be empty.");

  const now = options.now ?? new Date();
  const skills = parseSkills(originalRequest, options.skillCatalog ?? DEFAULT_SKILL_CATALOG);
  const startWindow = parseStartWindow(originalRequest, now);
  const availabilityRequirement = startWindow?.raw ?? null;
  const constraints = parseLabeledList(originalRequest, ["constraints", "einschränkungen"]);
  const explicitContractualRequirements = parseLabeledList(originalRequest, ["contract terms", "contractual requirements", "vertragsanforderungen"]);
  const candidate = {
    schemaVersion: 1 as const,
    originalRequest,
    projectTitle: null,
    summary: originalRequest.replace(/\s+/gu, " ").trim(),
    requiredSkills: skills.required,
    optionalSkills: skills.optional,
    language: parseLanguage(originalRequest, options.languageAliases ?? DEFAULT_LANGUAGE_ALIASES),
    workMode: parseWorkMode(originalRequest),
    location: parseLocation(originalRequest),
    startWindow,
    duration: parseDuration(originalRequest),
    budget: parseBudget(originalRequest),
    rate: parseRate(originalRequest),
    constraints,
    qualifications: parseLabeledList(originalRequest, ["qualifications", "qualifikationen"]),
    availabilityRequirement,
    contractualRequirements: canonicalList([
      ...(explicitContractualRequirements ?? []),
      ...(contractualConstraints(constraints) ?? []),
    ]),
  };

  return ProjectBriefSchema.parse({
    ...candidate,
    unknownFields: deriveUnknownFields(candidate),
  });
}
