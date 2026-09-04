import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const AUTH_PAGE_SIZE = 1_000;
const AUTH_MAX_PAGES = 20;

export async function readAdminAuthEmails(): Promise<{
  emails: Map<string, string | null>;
  truncated: boolean;
}> {
  const admin = createAdminSupabaseClient();
  const emails = new Map<string, string | null>();
  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw error;
    for (const user of data.users) {
      emails.set(user.id, user.email?.trim() ? user.email : null);
    }
    if (data.users.length < AUTH_PAGE_SIZE) {
      return { emails, truncated: false };
    }
  }
  return { emails, truncated: true };
}
