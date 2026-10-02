import "server-only";

import { platformAnalyticsExcludedEmails } from "@/lib/admin/analytics-exclusions";
import { hasAdminRole } from "@/lib/auth/admin-role";
import { contactWorkload } from "@/lib/crm/contacts-data";
import { berlinToday } from "@/lib/crm/contacts-model";
import { promotionalDeliveryConfigured } from "@/lib/email/deliver";
import { readLeadAutomation, type LeadAutomation } from "@/lib/leadgen/automation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  ACTIVITY_ACTIONS,
  activityLabel,
  countBetween,
  dailySeries,
  rangeWindow,
  type OverviewRange,
  type SystemHealth,
} from "./overview-model";

/**
 * Die Zahlen der Admin-Übersicht in einem Zug.
 *
 * Jede Kachel hat einen Vorzeitraum gleicher Länge zum Vergleich. Interne
 * Konten (Admin-Rolle und PLATFORM_ANALYTICS_EXCLUDED_EMAILS) zählen nicht
 * mit — dieselbe Regel wie auf der Nutzerseite, sonst zählte jede eigene
 * Testsuche als Nachfrage.
 *
 * Fällt eine einzelne Quelle aus, bleibt ihre Zahl leer, statt die ganze
 * Übersicht mitzureißen: Ein Cockpit, das bei einer gesperrten Tabelle weiß
 * bleibt, zeigt im falschen Moment gar nichts.
 */

const TREND_DAYS = 14;
const USER_CACHE_MS = 60_000;

type UserIndex = { at: number; excluded: Set<string>; registered: string[]; guests: string[] };
let userCache: UserIndex | null = null;

async function userIndex(now: number): Promise<UserIndex> {
  if (userCache && now - userCache.at < USER_CACHE_MS) return userCache;
  const admin = createAdminSupabaseClient();
  const excludedEmails = platformAnalyticsExcludedEmails();
  const excluded = new Set<string>();
  const registered: string[] = [];
  const guests: string[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const email = user.email?.trim().toLocaleLowerCase("de-DE") ?? null;
      if (hasAdminRole(user.app_metadata) || (email && excludedEmails.has(email))) {
        excluded.add(user.id);
        continue;
      }
      if (user.is_anonymous) guests.push(user.created_at);
      else registered.push(user.created_at);
    }
    if (data.users.length < 1000) break;
  }
  userCache = { at: now, excluded, registered, guests };
  return userCache;
}

async function settle<T>(promise: PromiseLike<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.error("admin overview source failed", error);
    return null;
  }
}

type Rows = Array<Record<string, unknown>>;

function rows<T extends { data: unknown; error: unknown }>(result: T | null): Rows {
  if (!result || result.error) return [];
  return (result.data ?? []) as Rows;
}

function count<T extends { count: number | null; error: unknown }>(result: T | null): number | null {
  if (!result || result.error) return null;
  return result.count ?? 0;
}

export type MetricWithTrend = { current: number; previous: number; trend: number[] } | null;

export type Overview = {
  generatedAt: string;
  range: OverviewRange;
  usage: {
    searches: MetricWithTrend;
    reliableShare: number | null;
    registrations: MetricWithTrend;
    guests: MetricWithTrend;
    requests: MetricWithTrend;
    searchesByDay: Array<{ day: string; count: number }>;
  };
  tasks: {
    placementReview: number | null;
    applications: number | null;
    leadDrafts: number | null;
    mandates: number | null;
    contactsDue: number | null;
    contactsNew: number | null;
  };
  leads: {
    found: number;
    created: number;
    noEmail: number;
    poolMismatch: number;
    matched: number;
    unmatched: number;
    sent: number | null;
    lastSeenAt: string | null;
    lastPrepareAt: string | null;
    lastSendAt: string | null;
  };
  automation: LeadAutomation;
  mailReady: boolean;
  system: SystemHealth | null;
  activity: Array<{ id: string; at: string; label: string }>;
  contactsTotal: number | null;
};

export async function loadOverview(range: OverviewRange, now: Date = new Date()): Promise<Overview> {
  const admin = createAdminSupabaseClient();
  const { start, previousStart } = rangeWindow(range, now);
  const trendStart = new Date(Math.min(previousStart.getTime(), now.getTime() - TREND_DAYS * 24 * 60 * 60 * 1000));
  const since = trendStart.toISOString();
  const rangeSince = start.toISOString();
  const today = berlinToday(now);

  const [
    users,
    searches,
    requests,
    placementReview,
    applications,
    leadDrafts,
    mandates,
    seen,
    leadShortlists,
    sent,
    lastSeen,
    runs,
    contacts,
    automation,
    system,
    audit,
  ] = await Promise.all([
    settle(userIndex(now.getTime())),
    settle(
      admin
        .from("shortlists")
        .select("created_at,owner_user_id,result_status")
        .eq("source", "user_search")
        .gte("created_at", since)
        .limit(20_000),
    ),
    settle(admin.from("intro_bookings").select("created_at,owner_user_id").gte("created_at", since).limit(5_000)),
    settle(admin.from("intro_bookings").select("id", { count: "exact", head: true }).eq("status", "manual_review")),
    settle(
      admin
        .from("freelancer_applications")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "in_review"]),
    ),
    settle(admin.from("leadgen_outreach").select("id", { count: "exact", head: true }).eq("state", "draft")),
    settle(
      admin
        .from("search_mandates")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),
    ),
    settle(admin.from("leadgen_seen_postings").select("outcome,first_seen").gte("first_seen", rangeSince).limit(5_000)),
    settle(
      admin
        .from("shortlists")
        .select("result_status")
        .eq("source", "lead")
        .gte("created_at", rangeSince)
        .limit(5_000),
    ),
    settle(
      admin
        .from("leadgen_outreach")
        .select("id", { count: "exact", head: true })
        .eq("state", "sent")
        .gte("sent_at", rangeSince),
    ),
    settle(
      admin.from("leadgen_seen_postings").select("last_seen").order("last_seen", { ascending: false }).limit(1),
    ),
    settle(
      admin
        .from("leadgen_run")
        .select("kind,started_at,trigger")
        .order("started_at", { ascending: false })
        .limit(40),
    ),
    settle(contactWorkload(today)),
    readLeadAutomation(),
    settle(admin.rpc("admin_system_health")),
    settle(
      admin
        .from("audit_events")
        .select("id,action,occurred_at,metadata,actor_user_id")
        .in("action", ACTIVITY_ACTIONS)
        .order("occurred_at", { ascending: false })
        .limit(80),
    ),
  ]);

  const excluded = users?.excluded ?? new Set<string>();
  const notExcluded = (row: Record<string, unknown>) => !excluded.has(String(row.owner_user_id ?? ""));

  const searchRows = rows(searches).filter(notExcluded);
  const searchTimes = searchRows.map((row) => String(row.created_at));
  const inRange = searchRows.filter((row) => Date.parse(String(row.created_at)) >= start.getTime());
  const reliable = inRange.filter((row) => row.result_status === "ranked").length;

  const metric = (times: readonly string[] | null): MetricWithTrend =>
    times
      ? {
          current: countBetween(times, start, now),
          previous: countBetween(times, previousStart, start),
          trend: dailySeries(times, TREND_DAYS, now).map((entry) => entry.count),
        }
      : null;

  const requestTimes = requests ? rows(requests).filter(notExcluded).map((row) => String(row.created_at)) : null;
  const seenRows = rows(seen);
  const outcome = (value: string) => seenRows.filter((row) => row.outcome === value).length;
  const leadRows = rows(leadShortlists);
  const runRows = rows(runs);
  const lastRun = (kind: string) => {
    const found = runRows.find((row) => row.kind === kind);
    return found ? String(found.started_at) : null;
  };

  const activity = rows(audit)
    .filter((row) => !excluded.has(String(row.actor_user_id ?? "")) || String(row.action).startsWith("crm_") || String(row.action).startsWith("leadgen_"))
    .flatMap((row) => {
      const label = activityLabel(String(row.action), (row.metadata as Record<string, unknown> | null) ?? null);
      return label ? [{ id: String(row.id), at: String(row.occurred_at), label }] : [];
    })
    .slice(0, 14);

  const systemData = system && !system.error ? (system.data as SystemHealth) : null;

  return {
    generatedAt: now.toISOString(),
    range,
    usage: {
      searches: searches ? metric(searchTimes) : null,
      reliableShare: inRange.length ? Math.round((reliable / inRange.length) * 100) : null,
      registrations: metric(users ? users.registered : null),
      guests: metric(users ? users.guests : null),
      requests: metric(requestTimes),
      searchesByDay: dailySeries(searchTimes, range === 30 ? 30 : TREND_DAYS, now),
    },
    tasks: {
      placementReview: count(placementReview),
      applications: count(applications),
      leadDrafts: count(leadDrafts),
      mandates: count(mandates),
      contactsDue: contacts?.due ?? null,
      contactsNew: contacts?.fresh ?? null,
    },
    leads: {
      found: seenRows.length,
      created: outcome("lead_created"),
      noEmail: outcome("no_email"),
      poolMismatch: outcome("pool_mismatch"),
      matched: leadRows.filter((row) => row.result_status === "ranked").length,
      unmatched: leadRows.filter((row) => row.result_status !== "ranked").length,
      sent: count(sent),
      lastSeenAt: rows(lastSeen)[0]?.last_seen ? String(rows(lastSeen)[0]!.last_seen) : null,
      lastPrepareAt: lastRun("prepare"),
      lastSendAt: lastRun("send"),
    },
    automation,
    mailReady: promotionalDeliveryConfigured(),
    system: systemData,
    activity,
    contactsTotal: contacts?.total ?? null,
  };
}

/** Nur der Systemstatus, für die Systemseite. */
export async function loadSystemHealth(): Promise<SystemHealth | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("admin_system_health");
  if (error) {
    console.error("admin_system_health failed", error);
    return null;
  }
  return data as SystemHealth;
}
