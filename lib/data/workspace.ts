import "server-only";

import { BRIEF_ANALYSIS_CREDITS } from "@/lib/ai/credit-policy";
import { currentPeriodEndIso, getAiCreditSnapshot } from "@/lib/ai/quota";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import {
  presentProject,
  presentProjectCollection,
  type ProjectCollectionRow,
  type ProjectRow,
} from "@/lib/data/projects";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Everything the workspace needs to become usable, resolved in one pass.
 *
 * The browser used to ask for this in four requests that each waited for the
 * previous one — session, then credits, then projects and folders, then the
 * last chat. Each was its own serverless function repeating the same session
 * check, so roughly a second went into round trips rather than work.
 *
 * Here the session is resolved once and the three reads run together. Each
 * read fails on its own: a credits outage must not cost the user their chat
 * list, which is exactly what the sequential version did.
 */

export type WorkspaceAuth = {
  authenticated: boolean;
  anonymous: boolean;
  admin: boolean;
  user: { id: string; displayName: string | null; email: string | null } | null;
};

export type WorkspaceUsage = {
  credits: Awaited<ReturnType<typeof getAiCreditSnapshot>> & {
    periodEnd: string;
    exhausted: boolean;
    creditsPerRequest: number;
    lastRequestCost: number | null;
  };
};

export type WorkspaceBootstrap = {
  auth: WorkspaceAuth;
  usage: WorkspaceUsage | null;
  projects: ReturnType<typeof presentProject>[];
  collections: ReturnType<typeof presentProjectCollection>[];
};

export function presentWorkspaceAuth(user: CurrentUser | null): WorkspaceAuth {
  return {
    authenticated: user !== null,
    anonymous: user?.isAnonymous ?? true,
    admin: user?.isAdmin ?? false,
    user: user
      ? { id: user.id, displayName: null, email: user.email }
      : null,
  };
}

export async function loadWorkspaceUsage(
  user: CurrentUser,
): Promise<WorkspaceUsage> {
  // Ein Guthaben, ein Aufruf. Bis September 2026 wurde hier ein zweites Konto
  // für die Websuche danebengeladen; das ist zusammengelegt.
  const credits = await getAiCreditSnapshot({
    userId: user.id,
    isAnonymous: user.isAnonymous,
  });

  return {
    credits: {
      ...credits,
      periodEnd: currentPeriodEndIso(),
      exhausted: credits.remaining <= 0,
      creditsPerRequest: BRIEF_ANALYSIS_CREDITS,
      // Nothing was spent by loading the workspace.
      lastRequestCost: null,
    },
  };
}

export async function loadOwnedProjects(user: CurrentUser) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  // The service role is deliberately constrained again by owner_user_id here.
  // The browser holds read-only RLS access to the same records.
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("projects")
    .select("*")
    .eq("owner_user_id", user.id)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as ProjectRow[]).map(presentProject);
}

export async function loadOwnedCollections(user: CurrentUser) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("project_collections")
    .select("*")
    .eq("owner_user_id", user.id)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as ProjectCollectionRow[]).map(presentProjectCollection);
}

export async function loadWorkspaceBootstrap(): Promise<WorkspaceBootstrap> {
  const user = await getCurrentUser();
  const auth = presentWorkspaceAuth(user);

  if (!user) {
    return { auth, usage: null, projects: [], collections: [] };
  }

  // `allSettled`, not `all`: one failing read degrades its own section and
  // leaves the rest of the workspace intact.
  const [usage, projects, collections] = await Promise.allSettled([
    loadWorkspaceUsage(user),
    loadOwnedProjects(user),
    loadOwnedCollections(user),
  ]);

  return {
    auth,
    usage: usage.status === "fulfilled" ? usage.value : null,
    projects: projects.status === "fulfilled" ? projects.value : [],
    collections: collections.status === "fulfilled" ? collections.value : [],
  };
}
