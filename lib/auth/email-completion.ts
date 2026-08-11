import { appPath } from "@/lib/app-path";
import { safeApplicationPath } from "@/lib/auth/redirect";

export type EmailAuthCompletion = {
  accessToken: string | null;
  code: string | null;
  destination: string;
  hasProviderError: boolean;
  refreshToken: string | null;
  sanitizedPath: string;
  state: string | null;
};

export function parseEmailAuthCompletion(href: string): EmailAuthCompletion {
  const url = new URL(href);
  const destination = safeApplicationPath(
    url.searchParams.get("next"),
    appPath("/chat"),
  );
  const hashParams = new URLSearchParams(url.hash.replace(/^#/u, ""));

  return {
    accessToken: hashParams.get("access_token"),
    code: url.searchParams.get("code"),
    destination,
    hasProviderError: Boolean(
      url.searchParams.get("error") ||
        url.searchParams.get("error_code") ||
        hashParams.get("error") ||
        hashParams.get("error_code"),
    ),
    refreshToken: hashParams.get("refresh_token"),
    sanitizedPath: `${appPath("/auth/complete")}?next=${encodeURIComponent(destination)}`,
    state: url.searchParams.get("state"),
  };
}

export function emailAuthFailurePath(destination: string) {
  const failureUrl = new URL(
    safeApplicationPath(destination, appPath("/chat")),
    "https://xportal.invalid",
  );
  failureUrl.searchParams.delete("set-password");
  failureUrl.searchParams.set("auth_error", "confirmation_failed");
  return `${failureUrl.pathname}${failureUrl.search}`;
}
