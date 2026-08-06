import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv, getSupabaseServerSecret } from "./env";

export function createAdminSupabaseClient() {
  const { url } = getSupabasePublicEnv();

  return createClient(url, getSupabaseServerSecret(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
