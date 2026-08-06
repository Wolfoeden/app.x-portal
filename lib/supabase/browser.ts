"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const { url, publishableKey } = getSupabasePublicEnv();
  browserClient = createBrowserClient(url, publishableKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    isSingleton: true,
  });

  return browserClient;
}
