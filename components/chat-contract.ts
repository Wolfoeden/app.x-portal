/**
 * Public client contract for the freelancer chat UI.
 *
 * Server routes may add fields, but should keep these canonical fields stable.
 * Missing facts are represented as null/empty arrays and must never be invented.
 */

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
  status?: "draft" | "matching" | "shortlisted" | "contact" | "closed";
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
}

export type ChatStreamEvent =
  | { type: "progress"; label: string }
  | { type: "text_delta"; delta: string }
  | { type: "result"; data: ChatResponse }
  | { type: "error"; message: string; retryable: boolean };

export interface ProjectDetailResponse {
  project: ProjectListItem;
  messages: ConversationMessage[];
  brief: StructuredBrief | null;
  profiles: FreelancerProfileResult[];
}

export interface SessionResponse {
  authenticated: boolean;
  anonymous: boolean;
  user: null | {
    id: string;
    displayName: string | null;
    email: string | null;
  };
}

export interface ChatApiPaths {
  chat: string;
  projects: string;
  session: string;
  emailLogin: string;
  emailRegister: string;
  providerLogin: string;
  logout: string;
  exportData: string;
  deleteData: string;
  introductions: string;
}

export const defaultChatApiPaths: ChatApiPaths = {
  chat: "/api/chat",
  projects: "/api/projects",
  session: "/api/auth/session",
  emailLogin: "/api/auth/login",
  emailRegister: "/api/auth/register",
  providerLogin: "/auth/sign-in",
  logout: "/api/auth/logout",
  exportData: "/api/account/export",
  deleteData: "/api/account/delete",
  introductions: "/api/introductions",
};
