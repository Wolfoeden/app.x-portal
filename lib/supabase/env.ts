const urlPattern = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !urlPattern.test(url) || !publishableKey) {
    throw new Error("Supabase public configuration is missing or invalid.");
  }

  return { url, publishableKey };
}

export function getSupabaseServerSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return secret;
}
