import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type ProfilePerformanceRow = {
  profileId: string;
  displayName: string;
  slug: string;
  roleTitle: string;
  profileStatus: string;
  availabilityStatus: string;
  hasBookingUrl: boolean;
  /** Times the profile was part of a shortlist shown to a customer. */
  impressions: number;
  /** Card seen for at least a second — only recorded for non-demo profiles. */
  profileViews: number;
  saves: number;
  cvDownloads: number;
  cvDenied: number;
  bookingClicks: number;
  introductions: number;
  lastActivityAt: string | null;
};

export type ProfilePerformanceTotals = {
  profiles: number;
  activeProfiles: number;
  impressions: number;
  profileViews: number;
  saves: number;
  cvDownloads: number;
  cvDenied: number;
  bookingClicks: number;
  introductions: number;
};

export type ProfilePerformanceReport = {
  generatedAt: string;
  /** When click and view recording started — earlier rows cannot exist. */
  eventTrackingSince: string | null;
  totals: ProfilePerformanceTotals;
  rows: ProfilePerformanceRow[];
  truncated: boolean;
};

const PAGE_SIZE = 1_000;
const MAX_ROWS = 50_000;

type Counter = Map<string, { count: number; last: string | null }>;

function bump(counter: Counter, key: string | null, at: string | null): void {
  if (!key) return;
  const current = counter.get(key) ?? { count: 0, last: null };
  current.count += 1;
  if (at && (!current.last || at > current.last)) current.last = at;
  counter.set(key, current);
}

function later(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

/**
 * Reads one table fully in pages and folds it into a counter keyed by profile.
 * Every source here is small today, but the admin area must not become the
 * reason a growing table takes the page down.
 */
async function countBy(
  table: string,
  keyColumn: string,
  timeColumn: string,
  equals: Readonly<Record<string, string>> = {},
): Promise<{ counter: Counter; truncated: boolean }> {
  const admin = createAdminSupabaseClient();
  const counter: Counter = new Map();
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = admin
      .from(table)
      .select(`${keyColumn},${timeColumn}`)
      .order(timeColumn, { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    for (const [column, value] of Object.entries(equals)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      const key = row[keyColumn];
      const at = row[timeColumn];
      bump(
        counter,
        typeof key === "string" ? key : null,
        typeof at === "string" ? at : null,
      );
    }
    if (rows.length < PAGE_SIZE) return { counter, truncated: false };
  }
  return { counter, truncated: true };
}

async function readEventTrackingStart(): Promise<string | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_profile_events")
    .select("occurred_at")
    .order("occurred_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const at = (data as { occurred_at?: unknown } | null)?.occurred_at;
  return typeof at === "string" ? at : null;
}

export async function getProfilePerformance(): Promise<ProfilePerformanceReport> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Admin profile service is not configured");
  }
  const admin = createAdminSupabaseClient();

  const [
    profilesResult,
    impressions,
    views,
    clicks,
    saves,
    introductions,
    cvAuthorized,
    cvDenied,
    trackingSince,
  ] = await Promise.all([
    admin
      .from("freelancer_profiles")
      .select(
        "id,display_name,slug,role_title,profile_status,availability_status,booking_url",
      )
      .order("display_name", { ascending: true })
      .range(0, MAX_ROWS - 1),
    countBy("matches", "freelancer_profile_id", "created_at"),
    countBy("freelancer_profile_events", "profile_id", "occurred_at", {
      event_type: "profile_view",
    }),
    countBy("freelancer_profile_events", "profile_id", "occurred_at", {
      event_type: "booking_click",
    }),
    countBy("saved_freelancers", "freelancer_id", "created_at"),
    countBy("intro_bookings", "freelancer_profile_id", "requested_at"),
    countBy("audit_events", "target_id", "occurred_at", {
      target_type: "freelancer_profile",
      action: "freelancer_cv_download_authorized",
    }),
    countBy("audit_events", "target_id", "occurred_at", {
      target_type: "freelancer_profile",
      action: "freelancer_cv_download_denied",
    }),
    readEventTrackingStart(),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  const profiles = (profilesResult.data ?? []) as {
    id: string;
    display_name: string;
    slug: string;
    role_title: string;
    profile_status: string;
    availability_status: string;
    booking_url: string | null;
  }[];

  const totals: ProfilePerformanceTotals = {
    profiles: profiles.length,
    activeProfiles: 0,
    impressions: 0,
    profileViews: 0,
    saves: 0,
    cvDownloads: 0,
    cvDenied: 0,
    bookingClicks: 0,
    introductions: 0,
  };

  const rows: ProfilePerformanceRow[] = profiles.map((profile) => {
    const row: ProfilePerformanceRow = {
      profileId: profile.id,
      displayName: profile.display_name,
      slug: profile.slug,
      roleTitle: profile.role_title,
      profileStatus: profile.profile_status,
      availabilityStatus: profile.availability_status,
      hasBookingUrl: Boolean(profile.booking_url),
      impressions: impressions.counter.get(profile.id)?.count ?? 0,
      profileViews: views.counter.get(profile.id)?.count ?? 0,
      saves: saves.counter.get(profile.id)?.count ?? 0,
      cvDownloads: cvAuthorized.counter.get(profile.id)?.count ?? 0,
      cvDenied: cvDenied.counter.get(profile.id)?.count ?? 0,
      bookingClicks: clicks.counter.get(profile.id)?.count ?? 0,
      introductions: introductions.counter.get(profile.id)?.count ?? 0,
      lastActivityAt: [
        impressions.counter.get(profile.id)?.last ?? null,
        views.counter.get(profile.id)?.last ?? null,
        clicks.counter.get(profile.id)?.last ?? null,
        cvAuthorized.counter.get(profile.id)?.last ?? null,
        introductions.counter.get(profile.id)?.last ?? null,
      ].reduce(later, null),
    };
    if (profile.profile_status === "active") totals.activeProfiles += 1;
    totals.impressions += row.impressions;
    totals.profileViews += row.profileViews;
    totals.saves += row.saves;
    totals.cvDownloads += row.cvDownloads;
    totals.cvDenied += row.cvDenied;
    totals.bookingClicks += row.bookingClicks;
    totals.introductions += row.introductions;
    return row;
  });

  // Busiest first; a profile nobody has seen is the least interesting row.
  rows.sort(
    (left, right) =>
      right.impressions - left.impressions ||
      right.cvDownloads - left.cvDownloads ||
      left.displayName.localeCompare(right.displayName, "de"),
  );

  return {
    generatedAt: new Date().toISOString(),
    eventTrackingSince: trackingSince,
    totals,
    rows,
    truncated:
      impressions.truncated ||
      views.truncated ||
      clicks.truncated ||
      saves.truncated ||
      introductions.truncated ||
      cvAuthorized.truncated ||
      cvDenied.truncated,
  };
}
