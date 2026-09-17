import "server-only";

import { hasAdminRole } from "@/lib/auth/admin-role";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const AUTH_PAGE_SIZE = 1_000;
const AUTH_MAX_PAGES = 20;

export async function readAdminAuthEmails(): Promise<{
  emails: Map<string, string | null>;
  adminUserIds: Set<string>;
  truncated: boolean;
}> {
  const admin = createAdminSupabaseClient();
  const emails = new Map<string, string | null>();
  const adminUserIds = new Set<string>();
  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw error;
    for (const user of data.users) {
      emails.set(user.id, user.email?.trim() ? user.email : null);
      if (hasAdminRole(user.app_metadata)) adminUserIds.add(user.id);
    }
    if (data.users.length < AUTH_PAGE_SIZE) {
      return { emails, adminUserIds, truncated: false };
    }
  }
  return { emails, adminUserIds, truncated: true };
}
