/**
 * Public client contract for the freelancer chat UI.
 *
 * Server routes may add fields, but should keep these canonical fields stable.
 * Missing facts are represented as null/empty arrays and must never be invented.
 */

import { appPath } from "@/lib/app-path";

export type ProjectMode = "remote" | "on-site" | "hybrid" | "unknown";

export interface StructuredBrief {
  projectTitle: string;
  summary: string;
  requiredSkills: string[];
  optionalSkills: string[];
  languages: string[];
  mode: ProjectMode;
  location: string | null;
  startWindow: string | null;
  duration: string | null;
  budgetOrRate: string | null;
  constraints: string[];
  qualifications: string[];
  availabilityRequirement: string | null;
  contractualRequirements: string[];
  unknownFields: string[];
}

export type VerificationLevel = "verified" | "self-reported" | "unknown";
export type AvailabilityStatus = "available" | "limited" | "unavailable" | "unknown";
export type IntroType = "free" | "premium";

export interface ProfileFact {
  label: string;
  value: string;
  verification: VerificationLevel;
}

export interface FreelancerProfileResult {
  id: string;
  demoStatus?: "demo" | "real";
  bookingUrl: string | null;
  displayName: string;
  role: string;
  skillTags: string[];
  languages: string[];
  location: string | null;
  remoteMode: ProjectMode;
  experienceSummary: string;
  facts: ProfileFact[];
  referenceStatus: string | null;
  rate: string | null;
  availabilityStatus: AvailabilityStatus;
  availabilityUpdatedAt: string | null;
  matchReasons: string[];
  knownGaps: string[];
  introPolicy: {
    type: IntroType;
    label: string;
    manualApprovalRequired: boolean;
    /** True only when the operator has explicitly unlocked direct booking. */
    readyToBook?: boolean;
  };
}

export interface ProjectListItem {
  id: string;
  title: string;
  updatedAt: string;
  collectionId?: string | null;
  status?: "draft" | "matching" | "shortlisted" | "contact" | "closed";
}

export interface ProjectCollectionItem {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface ChatRequest {
  projectId?: string | null;
  message: string;
  clientMessageId?: string;
}

/** Monthly, non-purchasable allowance for the normal Nano brief analysis. */
export interface FreeAnalysisUsageSnapshot {
  limit: number;
  used: number;
  reserved: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  exhausted: boolean;
}

/** Purchased product credits. These never replace the monthly free allowance. */
export interface ProductCreditSnapshot {
  balance: number;
  reserved: number;
  available: number;
  euroPerCredit: string;
}

export interface AiUsageSnapshot {
  freeUsage: FreeAnalysisUsageSnapshot;
  /** Null for guest sessions because paid searches require an account. */
  productCredits: ProductCreditSnapshot | null;
}

/** Routes may return only the balance they changed; the client merges safely. */
export interface AiUsageUpdate {
  freeUsage?: FreeAnalysisUsageSnapshot;
  productCredits?: ProductCreditSnapshot | null;
}

export type AiProviderTransport =
  | "unconfigured"
  | "direct_openai"
  | "netlify_ai_gateway"
  | "custom_gateway";

export type ActiveAiProviderTransport = Exclude<
  AiProviderTransport,
  "unconfigured"
>;

export interface AiAnalysisProviderStatus {
  /** A provider key/endpoint is configured. This alone does not prove a call. */
  configured: boolean;
  /** The provider client was actually invoked for this analysis. */
  attempted: boolean;
  /** A provider response was received. This is independent of fallback use. */
  succeeded: boolean;
  /** The displayed brief came from the deterministic basis analysis. */
  fallback: boolean;
  /** Configured route targeted by the request; never present this as "used" alone. */
  requestedTransport: AiProviderTransport;
  /** Route that returned a response; null until `succeeded` is true. */
  actualTransport: ActiveAiProviderTransport | null;
  /** Model requested by the server, whether or not the call completed. */
  requestedModel: string | null;
  /** Model reported by the provider response; null until a response exists. */
  actualModel: string | null;
  /** Redacted reason when no usable provider analysis was accepted. */
  failureCategory:
    | "application_limit"
    | "auth_error"
    | "billing_or_quota"
    | "rate_limit"
    | "permission"
    | "model_unavailable"
    | "timeout"
    | "invalid_output"
    | "provider_error"
    | "unconfigured"
    | null;
}

export interface AiAnalysisStep {
  label: string;
  detail: string;
  status: "completed" | "warning";
}

export interface AiAnalysisTrace {
  provider: AiAnalysisProviderStatus;
  /** Diagnostic input only; the UI renders fixed public milestones. */
  steps: AiAnalysisStep[];
  externalSearchAvailable: boolean;
}

export interface ExternalFreelancerCandidate {
  displayName: string;
  role: string;
  summary: string;
  matchedRequirements: string[];
  knownGaps: string[];
  profileUrl: string;
  bookingUrl: string;
  sourceUrls: string[];
  verificationStatus: "external_unverified";
}

export interface ExternalFreelancerSearchResponse {
  projectId: string;
  candidates: ExternalFreelancerCandidate[];
  disclosure: string;
  mode: "openai" | "unavailable";
  notice?: string;
  searchTrace: {
    queries: string[];
    consultedSourceCount: number;
    returnedCandidateCount: number;
  };
  usage?: AiUsageUpdate;
}

export interface ChatResponse {
  project: ProjectListItem;
  message: ConversationMessage | string;
  brief: StructuredBrief;
  /** Already filtered and deterministically ordered by the server. */
  matches: FreelancerProfileResult[];
  mode?: "ai" | "fallback";
  notice?: string;
  match?: {
    id: string;
    ruleVersion: string;
    profileDataVersion: string;
    createdAt: string;
  };
  quota?: {
    remainingRequests: number | null;
    retryAfterSeconds: number | null;
  };
  usage?: AiUsageUpdate;
  analysis?: AiAnalysisTrace;
  /** Server build that produced this response, when supplied by the API. */
  buildVersion?: string;
}

export type ChatStreamEvent =
  | { type: "accepted"; projectId: string; buildVersion?: string }
  | { type: "heartbeat"; at: number }
  | { type: "progress"; label: string }
  | { type: "text_delta"; delta: string }
  | { type: "result"; data: ChatResponse }
  | {
      type: "error";
      message: string;
      retryable: boolean;
      code?: string;
      projectId?: string;
    };

export interface ProjectDetailResponse {
  project: ProjectListItem;
  messages: ConversationMessage[];
  brief: StructuredBrief | null;
  profiles: FreelancerProfileResult[];
  analysisMode?: "ai" | "fallback";
  analysisNotice?: string | null;
}

export interface SessionResponse {
  authenticated: boolean;
  anonymous: boolean;
  admin?: boolean;
  user: null | {
    id: string;
    displayName: string | null;
    email: string | null;
  };
}

export interface ChatApiPaths {
  chat: string;
  projects: string;
  projectCollections: string;
  session: string;
  /** Monthly free-usage and purchased-product-credit snapshot endpoint. */
  credits?: string;
  /** Protected operator-only usage dashboard. */
  adminUsage?: string;
  /** Explicit, separately disclosed web search offered only after zero internal matches. */
  freelancerSearch: string;
  emailLogin: string;
  emailRegister: string;
  providerLogin: string;
  logout: string;
  exportData: string;
  deleteData: string;
  introductions: string;
}

export const defaultChatApiPaths: ChatApiPaths = {
  chat: appPath("/api/chat"),
  projects: appPath("/api/projects"),
  projectCollections: appPath("/api/project-collections"),
  session: appPath("/api/auth/session"),
  credits: appPath("/api/ai/credits"),
  adminUsage: appPath("/chat/admin/ai-usage"),
  freelancerSearch: appPath("/api/freelancer-search"),
  emailLogin: appPath("/api/auth/login"),
  emailRegister: appPath("/api/auth/register"),
  providerLogin: appPath("/auth/sign-in"),
  logout: appPath("/api/auth/logout"),
  exportData: appPath("/api/account/export"),
  deleteData: appPath("/api/account/delete"),
  introductions: appPath("/api/introductions"),
};
