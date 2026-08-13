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
  collection_id?: string | null;
};

export type ProjectCollectionRow = {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
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
    collectionId: row.collection_id ?? null,
    status,
  };
}

export function presentProjectCollection(row: ProjectCollectionRow) {
  return { id: row.id, name: row.name, updatedAt: row.updated_at };
}

export function deriveProjectTitle(message: string): string {
  const normalized = message.replace(/\s+/gu, " ").trim();
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69).trimEnd()}…`;
}
