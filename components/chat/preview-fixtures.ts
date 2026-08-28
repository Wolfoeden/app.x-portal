import type {
  AiAnalysisTrace,
  AiUsageSnapshot,
  ConversationMessage,
  FreelancerProfileResult,
  ProjectListItem,
  SessionResponse,
  StructuredBrief,
} from "../chat-contract";

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
    demoStatus: "real",
    avatarUrl: null,
    bookingUrl: "https://example.com/anna/termin",
    cvAccess: "available",
    displayName: "Anna Keller",
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
    demoStatus: "real",
    avatarUrl: null,
    bookingUrl: "https://example.com/daniel/termin",
    cvAccess: "missing",
    displayName: "Daniel Weber",
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
  productCredits: {
    balance: 90,
    reserved: 0,
    available: 90,
    euroPerCredit: "0.0166666667",
  },
};
