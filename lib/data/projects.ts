import type { ProjectListItem } from "@/components/chat-contract";

export type ProjectRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  original_request: string;
  structured_brief: unknown;
  brief_status: "pending" | "ready" | "failed" | "manual";
  status:
    | "draft"
    | "matching"
    | "shortlisted"
    | "intro_requested"
    | "active"
    | "completed"
    | "cancelled"
    | "archived";
  created_at: string;
  updated_at: string;
};

export function presentProject(row: ProjectRow): ProjectListItem {
  let status: ProjectListItem["status"];
  switch (row.status) {
    case "intro_requested":
      status = "contact";
      break;
    case "active":
    case "completed":
    case "cancelled":
    case "archived":
      status = "closed";
      break;
    default:
      status = row.status;
  }

  return {
    id: row.id,
    title: row.title ?? "Freelancer-Anfrage",
    updatedAt: row.updated_at,
    status,
  };
}

export function deriveProjectTitle(message: string): string {
  const normalized = message.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69).trimEnd()}…`;
}
