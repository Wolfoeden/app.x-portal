/**
 * Accounts that represent internal operation or testing rather than customer
 * usage. Keep this rule in one place so every admin report applies the same
 * definition before it aggregates data.
 */
const BUILT_IN_EXCLUDED_EMAILS = ["roman@dering.info"] as const;

function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

export function platformAnalyticsExcludedEmails(): ReadonlySet<string> {
  const configured = (process.env.PLATFORM_ANALYTICS_EXCLUDED_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  return new Set([
    ...BUILT_IN_EXCLUDED_EMAILS.map(normalizeEmail),
    ...configured,
  ]);
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
): ReadonlySet<string> {
  return new Set(
    [...emailsByUserId.entries()]
      .filter(([, email]) => isPlatformAnalyticsExcludedEmail(email))
      .map(([userId]) => userId),
  );
}

export function isExcludedAnalyticsUser(
  userId: string | null | undefined,
  excludedUserIds: ReadonlySet<string>,
): boolean {
  return Boolean(userId && excludedUserIds.has(userId));
}
