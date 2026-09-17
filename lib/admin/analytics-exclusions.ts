/**
 * Accounts that represent internal operation or testing rather than customer
 * usage: every account with the admin role, plus any address listed in
 * PLATFORM_ANALYTICS_EXCLUDED_EMAILS. Keep this rule in one place so every
 * admin report applies the same definition before it aggregates data.
 */

function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

export function platformAnalyticsExcludedEmails(): ReadonlySet<string> {
  return new Set(
    (process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function isPlatformAnalyticsExcludedEmail(
  email: string | null | undefined,
): boolean {
  return Boolean(
    email && platformAnalyticsExcludedEmails().has(normalizeEmail(email)),
  );
}

export function platformAnalyticsExcludedUserIds(
  emailsByUserId: ReadonlyMap<string, string | null>,
  adminUserIds: ReadonlySet<string> = new Set(),
): ReadonlySet<string> {
  return new Set([
    ...adminUserIds,
    ...[...emailsByUserId.entries()]
      .filter(([, email]) => isPlatformAnalyticsExcludedEmail(email))
      .map(([userId]) => userId),
  ]);
}

export function isExcludedAnalyticsUser(
  userId: string | null | undefined,
  excludedUserIds: ReadonlySet<string>,
): boolean {
  return Boolean(userId && excludedUserIds.has(userId));
}
