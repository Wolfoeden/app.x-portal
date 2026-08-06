import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) return null;

  return {
    id: data.claims.sub,
    email:
      typeof data.claims.email === "string" ? data.claims.email : null,
    isAnonymous: data.claims.is_anonymous === true,
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response("Authentication required", { status: 401 });
  }

  return user;
}
