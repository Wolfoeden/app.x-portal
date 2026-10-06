import type {
  AiAnalysisTrace,
  AiUsageSnapshot,
  ConversationItem,
  ConversationMessage,
  FreelancerProfileResult,
  ProjectCollectionItem,
  ProjectListItem,
  SessionResponse,
  StructuredBrief,
} from "../chat-contract";
import type { RegisteredShowcase } from "@/lib/freelancer/showcase";
import type { ProfileDossier } from "@/lib/profile/dossier";

export const previewAuth: SessionResponse = {
  authenticated: true,
  anonymous: false,
  admin: false,
  user: {
    id: "preview-user",
    displayName: "Roman Dering",
    email: "roman@example.test",
  },
};

export const previewGuestAuth: SessionResponse = {
  authenticated: true,
  anonymous: true,
  admin: false,
  user: null,
};

export const previewProjects: ProjectListItem[] = [
  {
    id: "preview-project",
    title: "Senior React Freelancer für SaaS-Relaunch",
    updatedAt: "2026-08-25T20:40:00.000Z",
    collectionId: null,
    status: "shortlisted",
  },
  {
    id: "preview-research",
    title: "Externe Recherche · Data Engineering",
    updatedAt: "2026-08-24T14:20:00.000Z",
    collectionId: null,
    status: "matching",
  },
  {
    id: "preview-closed",
    title: "Webflow Unterstützung für Kampagne",
    updatedAt: "2026-08-12T09:00:00.000Z",
    collectionId: null,
    status: "closed",
  },
  {
    id: "preview-collected",
    title: "SAP BTP Integration für Rechnungseingang",
    updatedAt: "2026-08-10T09:00:00.000Z",
    collectionId: "preview-collection",
    status: "matching",
  },
];

export const previewCollections: ProjectCollectionItem[] = [
  { id: "preview-collection", name: "Digitalisierung 2027", updatedAt: "2026-08-10T09:00:00.000Z" },
];

export const previewMessages: ConversationMessage[] = [
  {
    id: "preview-user-message",
    role: "user",
    content:
      "Wir suchen für den Relaunch unserer B2B-SaaS-Plattform einen Senior React Freelancer. TypeScript und Next.js sind Muss, Deutsch ist erforderlich, überwiegend remote mit einzelnen Terminen in Berlin. Start möglichst im September.",
  },
  {
    id: "preview-assistant-message",
    role: "assistant",
    content:
      "Der interne Profilabgleich ist abgeschlossen. Zwei aktive Profile erfüllen die aktuellen Muss-Kriterien und die Empfehlungsschwelle. Die Profile stehen direkt unter dieser Nachricht — mit belegten Stärken, offenen Punkten, Merkliste und eindeutigen Kontaktwegen.",
  },
];

export const previewBrief: StructuredBrief = {
  projectTitle: "Senior React Freelancer für SaaS-Relaunch",
  summary:
    "Frontend-Relaunch einer B2B-SaaS-Plattform mit React, TypeScript und Next.js; überwiegend remote mit einzelnen Terminen in Berlin.",
  requiredSkills: ["React", "TypeScript", "Next.js"],
  optionalSkills: ["Design Systems", "SaaS"],
  languages: ["Deutsch"],
  languageSource: "required",
  mode: "hybrid",
  location: "Berlin",
  startWindow: "September 2026",
  duration: null,
  budgetOrRate: null,
  constraints: ["Überwiegend remote"],
  qualifications: [],
  availabilityRequirement: "Start im September",
  contractualRequirements: [],
  unknownFields: ["duration", "budget"],
  requirementGroups: [
    { id: "skills", category: "skill", priority: "hard", operator: "all_of", values: ["React", "TypeScript", "Next.js"] },
    { id: "language", category: "language", priority: "hard", operator: "all_of", values: ["Deutsch"] },
    { id: "optional", category: "skill", priority: "optional", operator: "any_of", values: ["Design Systems", "SaaS"] },
  ],
};

export const previewProfiles: FreelancerProfileResult[] = [
  {
    id: "preview-anna",
    demoStatus: "demo",
    avatarUrl: null,
    bookingUrl: "https://example.com/anna/termin",
    cvAccess: "available",
    contactLinks: { linkedin: true, github: false },
    displayName: "Anna Keller",
    field: "frontend",
    highlight: {
      title: "Designsystem für ein Versicherungsportal",
      meta: "Direktversicherer · 2024 – 2025",
      technologies: ["React", "TypeScript", "Storybook"],
      verified: true,
    },
    projectCount: 1,
    role: "Senior Frontend Engineer",
    skillTags: ["React", "TypeScript", "Next.js", "Design Systems", "SaaS", "Testing"],
    languages: ["Deutsch", "Englisch"],
    location: "Berlin",
    remoteMode: "hybrid",
    experienceSummary:
      "12 Jahre Frontend-Erfahrung, zuletzt verantwortlich für den Relaunch einer europäischen B2B-SaaS-Plattform.",
    facts: [
      { label: "React", value: "React-Projekterfahrung durch Referenzen belegt", verification: "verified" },
      { label: "Sprache", value: "Deutsch C2", verification: "self-reported" },
    ],
    referenceStatus: "Verifiziert",
    rate: "950 € / Tag",
    availabilityStatus: "available",
    availabilityUpdatedAt: "2026-08-24T08:30:00.000Z",
    matchReasons: [
      "React, TypeScript und Next.js sind in Referenzprojekten belegt.",
      "Deutsch ist im Profil angegeben.",
      "Hybrid in Berlin entspricht dem gewünschten Arbeitsmodus.",
      "SaaS- und Design-System-Erfahrung ergänzen die Muss-Kriterien.",
    ],
    knownGaps: ["Die genaue Projektlaufzeit ist noch nicht angegeben."],
    recommendationRole: "primary",
    fitScore: 96,
    coreCoverage: 100,
    introPolicy: {
      type: "free",
      label: "Direkt buchbares Erstgespräch",
      manualApprovalRequired: false,
      readyToBook: true,
    },
  },
  {
    id: "preview-daniel",
    demoStatus: "demo",
    avatarUrl: null,
    bookingUrl: "https://example.com/daniel/termin",
    cvAccess: "missing",
    displayName: "Daniel Weber",
    field: "frontend",
    role: "Frontend Consultant",
    skillTags: ["React", "TypeScript", "Next.js", "Testing", "Performance"],
    languages: ["Deutsch", "Englisch"],
    location: "Hamburg",
    remoteMode: "remote",
    experienceSummary:
      "8 Jahre Erfahrung mit React-Produkten, technischer Modernisierung und Performance-Optimierung.",
    facts: [
      { label: "Skills", value: "React und TypeScript", verification: "verified" },
      { label: "Arbeitsmodus", value: "Remote", verification: "self-reported" },
    ],
    referenceStatus: "Teilweise geprüft",
    rate: null,
    availabilityStatus: "limited",
    availabilityUpdatedAt: "2026-08-22T11:00:00.000Z",
    matchReasons: [
      "React, TypeScript und Next.js sind belegt.",
      "Deutsch ist im Profil angegeben.",
      "Start im September ist grundsätzlich möglich.",
    ],
    knownGaps: [
      "Vor-Ort-Termine in Berlin sind nicht bestätigt.",
      "Der genaue Tagessatz ist offen.",
    ],
    recommendationRole: "alternative",
    fitScore: 82,
    coreCoverage: 80,
    introPolicy: {
      type: "free",
      label: "Direkt buchbares Erstgespräch",
      manualApprovalRequired: false,
      readyToBook: true,
    },
  },
];

export const previewAnalysis: AiAnalysisTrace = {
  provider: {
    configured: true,
    attempted: true,
    succeeded: true,
    fallback: false,
    requestedTransport: "direct_openai",
    actualTransport: "direct_openai",
    requestedModel: "gpt-5.4-nano-2026-03-17",
    actualModel: "gpt-5.4-nano-2026-03-17",
    failureCategory: null,
  },
  steps: [],
  externalSearchAvailable: false,
};

export const previewUsage: AiUsageSnapshot = {
  credits: {
    total: 1_500,
    used: 318,
    reserved: 0,
    remaining: 1_182,
    periodEnd: "2026-09-01T00:00:00.000Z",
    exhausted: false,
    creditsPerRequest: 3,
    planId: "free",
    lastRequestCost: 22,
  },
};

/*
 * Fictional, local-only examples for the "KI & Automatisierungen" request.
 * Groups, reasons and gaps use the shapes and wording the parser and matcher
 * actually produce, so the preview shows states production can reach.
 */
export const automationRequest =
  "Wir wollen wiederkehrende Abläufe mit KI automatisieren: Workflow-Automatisierungen bauen und ein LLM an unsere Bestandssysteme anbinden, perspektivisch auch RAG auf unsere eigenen Dokumente. Projektbasis, remote, Start kurzfristig.";

/** The same request with n8n as a must and a fixed day-rate ceiling. */
export const automationStrictRequest = `${automationRequest} n8n ist zwingend. Maximal 500 € pro Tag.`;

export const automationBrief: StructuredBrief = {
  ...previewBrief,
  projectTitle: "KI-Workflow-Automatisierung mit LLM-Anbindung",
  summary: "Workflow-Automatisierungen und LLM-Anbindung an bestehende Systeme. RAG perspektivisch.",
  requiredSkills: ["Large Language Models"],
  optionalSkills: ["RAG"],
  mode: "remote",
  location: null,
  startWindow: "kurzfristig",
  languages: [],
  languageSource: null,
  constraints: [],
  availabilityRequirement: null,
  unknownFields: ["duration", "budget"],
  requirementGroups: [
    { id: "skill:core:all_of:large-language-models", category: "skill", priority: "core", operator: "all_of", values: ["Large Language Models"] },
    { id: "skill:optional:all_of:rag", category: "skill", priority: "optional", operator: "all_of", values: ["RAG"] },
    { id: "work_mode:core:all_of:remote", category: "work_mode", priority: "core", operator: "all_of", values: ["remote"] },
  ],
};

export const automationStrictBrief: StructuredBrief = {
  ...automationBrief,
  requiredSkills: ["n8n", "Large Language Models"],
  budgetOrRate: "max. 500 € / Tag",
  unknownFields: ["duration"],
  requirementGroups: [
    { id: "skill:hard:all_of:n8n", category: "skill", priority: "hard", operator: "all_of", values: ["n8n"] },
    ...automationBrief.requirementGroups,
  ],
};

function competencies(values: readonly string[]) {
  return values.map((value) => ({ label: "Selbstauskunft", value: `Kompetenz: ${value}`, verification: "self-reported" as const }));
}

/** Two recommended profiles: both name an LLM competence (and n8n, for the strict request). */
export const automationProfiles: FreelancerProfileResult[] = [
  {
    ...previewProfiles[0],
    id: "preview-automation-strategy",
    cvAccess: "missing",
    displayName: "Alex Beispiel",
    field: "ai",
    role: "KI-Strategieberater & KI-Coach",
    skillTags: ["KI-Strategie", "KI-Roadmap", "AI consulting", "KI-Coaching", "Workshops", "N8n", "API integration", "Prozessautomatisierung", "Large Language Models", "RAG"],
    location: "Leipzig",
    remoteMode: "remote",
    experienceSummary: "Unterstützt Unternehmen bei KI-Roadmaps, Prozessautomatisierung und der Einführung von LLM- und RAG-Lösungen. Fiktives Beispielprofil für die lokale Vorschau.",
    facts: competencies(["KI-Strategie", "N8n", "API integration", "Prozessautomatisierung", "Large Language Models", "RAG"]),
    rate: "2.000 € / Tag",
    referenceStatus: "Nicht verifiziert",
    availabilityStatus: "available",
    matchReasons: [
      "Projektverfügbarkeit ist aktuell bestätigt.",
      "Belegte Kernkompetenzen: Large Language Models.",
      "Arbeitsmodus passend: remote.",
      "Optionale Kompetenzen passend: RAG.",
    ],
    knownGaps: ["Das gewünschte Startfenster ist im Profil nicht separat bestätigt."],
  },
  {
    ...previewProfiles[1],
    id: "preview-automation-integration",
    cvAccess: "available",
    displayName: "Jo Beispiel",
    field: "software",
    role: "Automatisierung & Systemintegration",
    skillTags: ["n8n", "Make", "API integration", "LLM", "Python", "PostgreSQL"],
    location: "Köln",
    remoteMode: "remote",
    experienceSummary: "Baut Workflow-Automatisierungen und Schnittstellen zwischen Fachsystemen. Fiktives Beispielprofil für die lokale Vorschau.",
    facts: competencies(["n8n", "Make", "API integration", "LLM", "Python"]),
    rate: "850 € / Tag",
    referenceStatus: "Selbstauskunft",
    availabilityStatus: "limited",
    matchReasons: [
      "Belegte Kernkompetenzen: Large Language Models.",
      "Arbeitsmodus passend: remote.",
    ],
    knownGaps: [
      "Projektverfügbarkeit ist begrenzt; den genauen Zeitraum beim Termin abstimmen.",
      "Das gewünschte Startfenster ist im Profil nicht separat bestätigt.",
      "Optionale Kompetenzen nicht aufgeführt: RAG.",
    ],
  },
];

/**
 * Below the recommendation gate for the strict request: each misses a core
 * requirement but breaks no fixed limit. A confirmed rate above the ceiling
 * would be a rejection, so neither shows one.
 */
export const automationPartialProfiles: FreelancerProfileResult[] = [
  {
    ...automationProfiles[1],
    id: "preview-automation-workflows",
    cvAccess: "missing",
    displayName: "Sam Beispiel",
    field: "software",
    role: "Workflow-Automatisierung",
    skillTags: ["n8n", "Zapier", "Make", "API integration", "Airtable"],
    location: "Hannover",
    experienceSummary: "Automatisiert wiederkehrende Abläufe mit n8n und Make. Fiktives Beispielprofil für die lokale Vorschau.",
    facts: competencies(["n8n", "Zapier", "Make", "API integration"]),
    rate: "480 € / Tag",
    availabilityStatus: "available",
    recommendationRole: "partial",
    fitScore: 58,
    coreCoverage: 50,
    matchReasons: [
      "Projektverfügbarkeit ist aktuell bestätigt.",
      "Belegte Kernkompetenzen: n8n.",
      "Arbeitsmodus passend: remote.",
      "Bestätigter Tagessatz liegt innerhalb der angegebenen EUR-Grenze.",
    ],
    knownGaps: [
      "Weitere Kernkompetenz ist im Profil nicht belegt: Large Language Models.",
      "Das gewünschte Startfenster ist im Profil nicht separat bestätigt.",
      "Optionale Kompetenzen nicht aufgeführt: RAG.",
    ],
  },
  {
    ...automationProfiles[1],
    id: "preview-automation-development",
    cvAccess: "missing",
    displayName: "Kim Beispiel",
    field: "ai",
    role: "KI / Full Stack / Cloud",
    skillTags: ["AI Agents", "MCP", "LLM", "RAG", "AWS", "Full Stack"],
    location: "Berlin",
    experienceSummary: "KI- und Full-Stack-Entwicklung. Fiktives Beispielprofil für die lokale Vorschau.",
    facts: competencies(["AI Agents", "MCP", "LLM", "RAG", "Full Stack"]),
    rate: null,
    availabilityStatus: "limited",
    recommendationRole: "partial",
    fitScore: 49,
    coreCoverage: 50,
    matchReasons: [
      "Belegte Kernkompetenzen: Large Language Models.",
      "Arbeitsmodus passend: remote.",
      "Optionale Kompetenzen passend: RAG.",
    ],
    knownGaps: [
      "Projektverfügbarkeit ist begrenzt; den genauen Zeitraum beim Termin abstimmen.",
      "Explizite Muss-Kompetenz ist im Profil nicht belegt: n8n; vor dem Gespräch verifizieren.",
      "Das gewünschte Startfenster ist im Profil nicht separat bestätigt.",
      "Tagessatz noch nicht bestätigt; Preisgrenze vor der Buchung abstimmen.",
    ],
  },
];

/** Assistant replies as the chat route words them for these three outcomes. */
export const automationReplies = {
  ranked:
    "Der interne Profilabgleich ist abgeschlossen. 2 aktive Profile erfüllen die aktuellen Muss-Kriterien und die Empfehlungsschwelle. Die Profile stehen direkt unter dieser Nachricht — mit belegten Stärken, offenen Punkten, Merkliste und eindeutigen Kontaktwegen.",
  partial:
    "Der interne Profilabgleich ist abgeschlossen. Derzeit erfüllt kein aktives, direkt buchbares Profil zugleich alle Muss-Kriterien und mindestens 70 % der Kernanforderungen. Ich zeige 2 nicht empfohlene Teiltreffer mit den belegten Überschneidungen und den ausschlaggebenden Lücken. Kennzeichnen Sie ein genanntes Kriterium im Chat als Muss, flexibel oder optional. Wenn das interne Ergebnis danach weiterhin nicht ausreicht, können Sie die getrennte externe Recherche für 30 Credits ausdrücklich starten.",
  noMatch:
    "Der interne Profilabgleich ist abgeschlossen. Derzeit erfüllt kein aktives, direkt buchbares Profil zugleich alle Muss-Kriterien und mindestens 70 % der Kernanforderungen. Kennzeichnen Sie ein genanntes Kriterium im Chat als Muss, flexibel oder optional. Wenn das interne Ergebnis danach weiterhin nicht ausreicht, können Sie die getrennte externe Recherche für 30 Credits ausdrücklich starten.",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

/**
 * Selbst angemeldete Profile unter dem Shortcut „AI-Agent-Entwickler finden“ —
 * fiktiv, nur für `/chat/preview?state=empty`. Je eine Karte mit frischer und
 * mit alter Verfügbarkeitsangabe, mit und ohne Honorar und eine geprüfte
 * Kompetenz, damit alle Zeilen der Karte zu sehen sind.
 */
export const agentShowcase: RegisteredShowcase = {
  theme: "ai-agents",
  label: "AI-Agent-Entwicklung",
  total: 4,
  profiles: [
    {
      id: "preview-showcase-1",
      displayName: "Kim Beispiel",
      role: "AI Engineer",
      avatarUrl: null,
      evidence: [
        { skill: "AI Agents", required: true, verified: true },
        { skill: "LangChain", required: false, verified: false },
        { skill: "n8n", required: false, verified: false },
      ],
      rate: "95 € / Stunde",
      availability: { status: "available", updatedAt: daysAgo(6), availableFrom: null },
      contact: "calendar",
      location: "München", workModes: ["remote", "hybrid"], verified: true,
      field: "ai",
      summaryExcerpt: "Baut seit 2023 Agenten für Kundenservice und interne Wissenssuche, zuletzt mit LangChain und n8n.",
      highlight: {
        title: "Service-Agent für Schadenmeldungen",
        meta: "Versicherer, 4.000 Mitarbeitende · seit 03/2025",
        technologies: ["LangChain", "Azure OpenAI", "Python", "RAG"],
        verified: true,
      },
      projectCount: 2,
    },
    {
      id: "preview-showcase-2",
      displayName: "Robin Beispiel",
      role: "KI-Entwicklung: Agenten, RAG und Automatisierung",
      avatarUrl: null,
      evidence: [
        { skill: "KI-Agenten", required: true, verified: false },
        { skill: "RAG", required: false, verified: false },
        { skill: "MCP", required: false, verified: false },
      ],
      rate: "800 € / Tag",
      availability: { status: "available", updatedAt: daysAgo(12), availableFrom: null },
      contact: "calendar",
      location: "Hamburg", workModes: ["remote"], verified: false,
      field: "ai",
      summaryExcerpt: "Entwickelt RAG-Assistenten für Versicherer und Behörden, vom Prototyp bis zum Betrieb.",
    },
    {
      id: "preview-showcase-3",
      displayName: "Jo Beispiel",
      role: "KI / Full Stack / Cloud",
      avatarUrl: null,
      evidence: [
        { skill: "AI Agents", required: true, verified: false },
        { skill: "LLM", required: false, verified: false },
        { skill: "RAG", required: false, verified: false },
      ],
      rate: null,
      availability: { status: "available", updatedAt: daysAgo(50), availableFrom: null },
      contact: "calendar",
      location: null, workModes: ["remote", "on_site"], verified: false,
      field: "ai",
      summaryExcerpt: null,
    },
  ],
};

/** „Gespräche“ in drei Zuständen: offene Frage, wartet auf Vorstellung, Anfrage an ein eigenes Profil. */
export const previewConversations: ConversationItem[] = [
  {
    id: "preview-conversation-1",
    role: "client",
    projectTitle: "Senior React Freelancer für SaaS-Relaunch",
    counterpartName: "Mira Falk",
    counterpartDetail: "Senior Frontend Engineer",
    profileId: "preview-profile-1",
    stage: "introduced",
    requestedAt: "2026-09-10T09:00:00.000Z",
    introducedAt: "2026-09-11T08:00:00.000Z",
    answer: null,
    answeredAt: null,
    engagementRecorded: false,
    question: 1,
    hasCalendar: true,
  },
  {
    id: "preview-conversation-2",
    role: "client",
    projectTitle: "KI-Automatisierung mit n8n",
    counterpartName: "Daniel Weber",
    counterpartDetail: "Automation Engineer",
    profileId: "preview-profile-2",
    stage: "requested",
    requestedAt: "2026-09-30T09:00:00.000Z",
    introducedAt: null,
    answer: null,
    answeredAt: null,
    engagementRecorded: false,
    question: null,
    hasCalendar: false,
  },
  {
    id: "preview-conversation-3",
    role: "freelancer",
    projectTitle: "Datenplattform für den Einkauf",
    counterpartName: "Beispiel GmbH",
    counterpartDetail: "Alex Muster",
    profileId: "preview-profile-3",
    stage: "introduced",
    requestedAt: "2026-09-25T09:00:00.000Z",
    introducedAt: "2026-09-26T09:00:00.000Z",
    answer: null,
    answeredAt: null,
    engagementRecorded: false,
    question: null,
    hasCalendar: false,
  },
];

/**
 * Vollständige Profile für das Seitenpanel und `/profil/vorschau`, ohne
 * Datenbank. Kim und Anna zeigen alle Teile — Projekte als Zeitleiste,
 * Links, geprüfte und angegebene Kompetenzen —, die übrigen nur, was die
 * Karte ohnehin weiß.
 */
function dossierFromResult(profile: FreelancerProfileResult, extra: Partial<ProfileDossier> = {}): ProfileDossier {
  return {
    id: profile.id,
    displayName: profile.displayName,
    role: profile.role,
    avatarUrl: profile.avatarUrl ?? null,
    field: profile.field ?? null,
    location: profile.location,
    workModes: profile.remoteMode === "on-site" ? ["on_site"] : profile.remoteMode === "unknown" ? ["remote"] : [profile.remoteMode],
    languages: profile.languages,
    summary: profile.experienceSummary || null,
    referencesSummary: null,
    skills: profile.skillTags.map((value) => ({ value, verified: false })),
    facts: [],
    verified: profile.referenceStatus === "Verifiziert",
    verificationText: profile.referenceStatus === "Verifiziert" ? "Profilprüfung durch XPORTAL abgeschlossen" : "Noch nicht von XPORTAL geprüft",
    rate: profile.rate,
    availability: { status: profile.availabilityStatus, updatedAt: profile.availabilityUpdatedAt, availableFrom: profile.availableFrom ?? null },
    contact: "calendar",
    projects: [],
    links: [],
    ...extra,
  };
}

const [kimCard, robinCard, joCard] = agentShowcase.profiles;

export const previewDossiers: Record<string, ProfileDossier> = {
  [kimCard!.id]: {
    id: kimCard!.id,
    displayName: kimCard!.displayName,
    role: kimCard!.role,
    avatarUrl: null,
    field: "ai",
    location: "München",
    workModes: ["remote", "hybrid"],
    languages: ["Deutsch (Muttersprache)", "Englisch (C1)"],
    summary:
      "Baut seit 2023 Agenten für Kundenservice und interne Wissenssuche, zuletzt mit LangChain und n8n. Davor sechs Jahre Backend-Entwicklung in Python für Versicherer und Händler. Arbeitet gern nah am Fachbereich und misst, ob ein Agent Tickets wirklich abnimmt.",
    referencesSummary: null,
    skills: [
      { value: "AI Agents", verified: true },
      { value: "Python", verified: true },
      { value: "LangChain", verified: false },
      { value: "n8n", verified: false },
      { value: "RAG", verified: false },
      { value: "Azure OpenAI", verified: false },
    ],
    facts: [
      { label: "Branchen", items: [{ value: "Versicherungen", verified: true }, { value: "Handel", verified: false }] },
      { label: "Qualifikationen", items: [{ value: "M.Sc. Informatik", verified: true }] },
    ],
    verified: true,
    verificationText: "Profilprüfung durch XPORTAL abgeschlossen",
    rate: kimCard!.rate,
    availability: kimCard!.availability,
    contact: "calendar",
    projects: [
      {
        title: "Service-Agent für Schadenmeldungen",
        client: "Versicherer, 4.000 Mitarbeitende",
        industry: "Versicherungen",
        role: "Lead Developer",
        period: "seit 03/2025",
        technologies: ["LangChain", "Azure OpenAI", "Python", "RAG"],
        outcome: "Ein Agent nimmt Erstmeldungen per Chat auf und legt sie im Kernsystem an; rund ein Drittel der Meldungen läuft ohne Rückfrage durch.",
        link: null,
        verified: true,
        source: "operator",
        sourceUrl: null,
      },
      {
        title: "Wissenssuche für den Innendienst",
        client: null,
        industry: "Handel",
        role: "Entwickler",
        period: "2023 – 2024",
        technologies: ["n8n", "RAG", "PostgreSQL"],
        outcome: "Suche über Handbücher und Tickets mit Quellenangabe, eingebunden in Teams.",
        link: null,
        verified: false,
        source: "freelancer",
        sourceUrl: null,
      },
    ],
    links: [
      { kind: "linkedin", url: "https://www.linkedin.com/in/beispiel" },
      { kind: "github", url: "https://github.com/beispiel" },
    ],
  },
  [robinCard!.id]: {
    id: robinCard!.id,
    displayName: robinCard!.displayName,
    role: robinCard!.role,
    avatarUrl: null,
    field: "ai",
    location: "Hamburg",
    workModes: ["remote"],
    languages: ["Deutsch", "Englisch"],
    summary: "Entwickelt RAG-Assistenten für Versicherer und Behörden, vom Prototyp bis zum Betrieb.",
    referencesSummary: "Zwei Projekte für eine Landesbehörde, Referenz liegt XPORTAL vor.",
    skills: [{ value: "KI-Agenten", verified: false }, { value: "RAG", verified: false }, { value: "MCP", verified: false }],
    facts: [],
    verified: false,
    verificationText: "Angaben laut Freelancer; Referenzen nicht geprüft",
    rate: robinCard!.rate,
    availability: robinCard!.availability,
    contact: "calendar",
    projects: [
      {
        title: "Antragsassistent für Förderprogramme",
        client: null,
        industry: "Öffentliche Verwaltung",
        role: "Freelance-Entwickler",
        period: "2024",
        technologies: ["RAG", "MCP"],
        outcome: null,
        link: null,
        verified: false,
        source: "research",
        sourceUrl: "https://www.freelancermap.de/",
      },
    ],
    links: [],
  },
  [joCard!.id]: {
    id: joCard!.id,
    displayName: joCard!.displayName,
    role: joCard!.role,
    avatarUrl: null,
    field: "ai",
    location: null,
    workModes: ["remote", "on_site"],
    languages: ["Deutsch"],
    summary: null,
    referencesSummary: null,
    skills: [{ value: "AI Agents", verified: false }, { value: "LLM", verified: false }, { value: "RAG", verified: false }],
    facts: [],
    verified: false,
    verificationText: "Noch nicht von XPORTAL geprüft",
    rate: null,
    availability: joCard!.availability,
    contact: "calendar",
    projects: [],
    links: [],
  },
  ...Object.fromEntries(
    [...previewProfiles, ...automationProfiles, ...automationPartialProfiles].map((profile) => [
      profile.id,
      dossierFromResult(
        profile,
        profile.id === "preview-anna"
          ? {
              projects: [
                {
                  title: "Designsystem für ein Versicherungsportal",
                  client: "Direktversicherer",
                  industry: "Versicherungen",
                  role: "Frontend Lead",
                  period: "2024 – 2025",
                  technologies: ["React", "TypeScript", "Storybook"],
                  outcome: "Ein Designsystem für zwölf Produktteams; neue Formularstrecken entstehen in Tagen statt Wochen.",
                  link: null,
                  verified: true,
                  source: "operator",
                  sourceUrl: null,
                },
              ],
              links: [{ kind: "website", url: "https://example.com" }],
            }
          : {},
      ),
    ]),
  ),
};
