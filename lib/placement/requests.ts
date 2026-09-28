import "server-only";

import { accountNameFromMetadata } from "@/lib/auth/account-name";
import { deliverEmail } from "@/lib/email/deliver";
import { logEvent } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { followUpDue, type PlacementOutcome } from "./follow-up-rules";
import {
  declineForClient,
  introductionForClient,
  introductionForFreelancer,
} from "./messages";

type Admin = ReturnType<typeof createAdminSupabaseClient>;

/** Ab diesen Zuständen ist vorgestellt, und der Kalender darf offen sein. */
export const INTRODUCED_STATUSES = ["ready_to_book", "booked", "completed"] as const;

export type PlacementStatus =
  | "manual_review"
  | "ready_to_book"
  | "booked"
  | "completed"
  | "cancelled"
  | "requested";

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Darf diese Person den Kalender des Freelancers öffnen?
 *
 * Mit eingeschaltetem Vermittlungsmodell nur nach einer Vorstellung. Sonst
 * wäre die Anfrage mit Zustimmung ein Umweg, den niemand nehmen muss, und
 * XPORTAL könnte die Vermittlung nicht belegen. Der Betreiber darf immer.
 */
export async function placementBookingAllowed(
  user: { id: string; isAdmin: boolean; isAnonymous: boolean } | null,
  profileId: string,
): Promise<boolean> {
  if (!user || user.isAnonymous) return false;
  if (user.isAdmin) return true;
  const { data, error } = await createAdminSupabaseClient()
    .from("intro_bookings")
    .select("id")
    .eq("owner_user_id", user.id)
    .eq("freelancer_profile_id", profileId)
    .in("status", [...INTRODUCED_STATUSES])
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Wie XPORTAL einen Freelancer per Mail erreicht: über sein Konto, sonst über
 * die Adresse aus der Bewerbung. Am 28.09.2026 hatten 59 von 70 aktiven
 * Profilen keines von beidem — sie hat der Betreiber selbst vorzustellen.
 */
export async function freelancerContactEmail(
  admin: Admin,
  profileId: string,
  ownerUserId: string | null,
): Promise<string | null> {
  if (ownerUserId) {
    const { data } = await admin.auth.admin.getUserById(ownerUserId);
    const email = data?.user?.email?.trim();
    if (email) return email;
  }
  const { data, error } = await admin
    .from("freelancer_applications")
    .select("contact_email")
    .eq("published_profile_id", profileId)
    .not("contact_email", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const email = (data as { contact_email?: string | null } | null)?.contact_email?.trim();
  return email || null;
}

async function clientContact(admin: Admin, userId: string) {
  const { data } = await admin.auth.admin.getUserById(userId);
  const user = data?.user;
  return {
    email: user?.email?.trim() || null,
    name: accountNameFromMetadata(user?.user_metadata),
  };
}

export type PlacementRequestRow = {
  id: string;
  status: PlacementStatus;
  requestedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  projectTitle: string | null;
  clientEmail: string | null;
  clientName: string | null;
  freelancerId: string;
  freelancerName: string;
  freelancerRole: string;
  freelancerReachable: boolean;
  hasCalendar: boolean;
  /** Was Kunde, Freelancer oder Betreiber zum Ausgang gesagt haben. */
  outcome: PlacementOutcome | null;
  outcomeSource: "client" | "freelancer" | "operator" | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  /** 1 oder 2, wenn eine Nachfrage fällig ist. */
  followUpDue: 1 | 2 | null;
  engagement: {
    dayRateMinor: number | null;
    projectDays: number | null;
    startsOn: string | null;
    feeMinor: number | null;
    feeStatus: "open" | "invoiced" | "paid" | "waived" | null;
    invoiceReference: string | null;
    termsVersion: string | null;
  } | null;
};

type EngagementRow = {
  intro_booking_id: string | null;
  day_rate_minor: number | null;
  project_days: number | null;
  starts_on: string | null;
  fee_minor: number | null;
  fee_status: "open" | "invoiced" | "paid" | "waived" | null;
  invoice_reference: string | null;
  terms_version: string | null;
};

type BookingRow = {
  id: string;
  status: PlacementStatus;
  requested_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  project_id: string;
  owner_user_id: string;
  freelancer_profile_id: string;
  outcome?: PlacementOutcome | null;
  outcome_source?: "client" | "freelancer" | "operator" | null;
  follow_up_count?: number;
  last_follow_up_at?: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string;
  role_title: string;
  booking_url: string | null;
  owner_user_id: string | null;
};

/** Die letzten Anfragen, offene zuerst. Für die Admin-Seite. */
export async function listPlacementRequests(
  limit = 100,
  now = new Date(),
): Promise<PlacementRequestRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("intro_bookings")
    .select("id,status,requested_at,confirmed_at,cancelled_at,project_id,owner_user_id,freelancer_profile_id,outcome,outcome_source,follow_up_count,last_follow_up_at")
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const bookings = (data ?? []) as BookingRow[];
  if (!bookings.length) return [];

  const projectIds = [...new Set(bookings.map((row) => row.project_id))];
  const profileIds = [...new Set(bookings.map((row) => row.freelancer_profile_id))];
  const ownerIds = [...new Set(bookings.map((row) => row.owner_user_id))];

  const [projects, profiles, engagements] = await Promise.all([
    admin.from("projects").select("id,title").in("id", projectIds),
    admin.from("freelancer_profiles").select("id,display_name,role_title,booking_url,owner_user_id").in("id", profileIds),
    admin
      .from("engagements")
      .select("intro_booking_id,day_rate_minor,project_days,starts_on,fee_minor,fee_status,invoice_reference,terms_version")
      .in("intro_booking_id", bookings.map((row) => row.id)),
  ]);
  if (projects.error) throw projects.error;
  if (profiles.error) throw profiles.error;
  if (engagements.error) throw engagements.error;
  const engagementByIntro = new Map(
    ((engagements.data ?? []) as EngagementRow[]).map((row) => [row.intro_booking_id, row]),
  );
  const titleById = new Map(
    ((projects.data ?? []) as { id: string; title: string | null }[]).map((row) => [row.id, row.title]),
  );
  const profileById = new Map(((profiles.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));

  const [clients, reachable] = await Promise.all([
    Promise.all(ownerIds.map(async (id) => [id, await clientContact(admin, id)] as const)),
    Promise.all(
      profileIds.map(async (id) => {
        const profile = profileById.get(id);
        const email = await freelancerContactEmail(admin, id, profile?.owner_user_id ?? null).catch(() => null);
        return [id, Boolean(email)] as const;
      }),
    ),
  ]);
  const clientById = new Map(clients);
  const reachableById = new Map(reachable);

  const rows = bookings.map((row): PlacementRequestRow => {
    const profile = profileById.get(row.freelancer_profile_id);
    const client = clientById.get(row.owner_user_id);
    const engagement = engagementByIntro.get(row.id) ?? null;
    const followUpCount = row.follow_up_count ?? 0;
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requested_at,
      confirmedAt: row.confirmed_at,
      cancelledAt: row.cancelled_at,
      projectTitle: titleById.get(row.project_id) ?? null,
      clientEmail: client?.email ?? null,
      clientName: client?.name ?? null,
      freelancerId: row.freelancer_profile_id,
      freelancerName: profile?.display_name ?? "Unbekanntes Profil",
      freelancerRole: profile?.role_title ?? "",
      freelancerReachable: reachableById.get(row.freelancer_profile_id) ?? false,
      hasCalendar: Boolean(httpsUrl(profile?.booking_url)),
      outcome: row.outcome ?? null,
      outcomeSource: row.outcome_source ?? null,
      followUpCount,
      lastFollowUpAt: row.last_follow_up_at ?? null,
      followUpDue: followUpDue(
        {
          status: row.status,
          confirmedAt: row.confirmed_at,
          outcome: row.outcome ?? null,
          followUpCount,
          hasEngagement: Boolean(engagement),
        },
        now,
      ),
      engagement: engagement
        ? {
            dayRateMinor: engagement.day_rate_minor,
            projectDays: engagement.project_days,
            startsOn: engagement.starts_on,
            feeMinor: engagement.fee_minor,
            feeStatus: engagement.fee_status,
            invoiceReference: engagement.invoice_reference,
            termsVersion: engagement.terms_version,
          }
        : null,
    };
  });
  // Was auf den Betreiber wartet, steht oben; danach nach Zeit.
  return rows.sort(
    (left, right) =>
      Number(right.status === "manual_review") - Number(left.status === "manual_review") ||
      right.requestedAt.localeCompare(left.requestedAt),
  );
}

async function loadOpenRequest(admin: Admin, id: string) {
  const { data, error } = await admin
    .from("intro_bookings")
    .select("id,status,requested_at,confirmed_at,cancelled_at,project_id,owner_user_id,freelancer_profile_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const booking = data as BookingRow | null;
  if (!booking) throw new Response("Anfrage nicht gefunden.", { status: 404 });
  if (booking.status !== "manual_review") {
    throw new Response("Diese Anfrage ist schon bearbeitet.", { status: 409 });
  }
  const [profile, project] = await Promise.all([
    admin
      .from("freelancer_profiles")
      .select("id,display_name,role_title,booking_url,owner_user_id")
      .eq("id", booking.freelancer_profile_id)
      .maybeSingle(),
    admin.from("projects").select("id,title").eq("id", booking.project_id).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (project.error) throw project.error;
  const profileRow = profile.data as ProfileRow | null;
  if (!profileRow) throw new Response("Profil nicht gefunden.", { status: 404 });
  return {
    booking,
    profile: profileRow,
    projectTitle: (project.data as { title: string | null } | null)?.title ?? null,
  };
}

/**
 * Die Vorstellung: Status setzen, dann beide Seiten per Mail bekannt machen.
 *
 * Der Status wechselt nur aus `manual_review` heraus. Klicken zwei Betreiber
 * gleichzeitig, gewinnt einer, und es gehen keine doppelten Mails raus.
 */
export async function approvePlacementRequest(id: string, siteUrl: string) {
  const admin = createAdminSupabaseClient();
  const { booking, profile, projectTitle } = await loadOpenRequest(admin, id);
  const bookingUrl = httpsUrl(profile.booking_url);

  const { data: updated, error } = await admin
    .from("intro_bookings")
    .update({
      status: "ready_to_book",
      confirmed_at: new Date().toISOString(),
      booking_url: bookingUrl,
      booking_provider: bookingUrl ? "calendly" : "manual",
    })
    .eq("id", booking.id)
    .eq("status", "manual_review")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new Response("Diese Anfrage ist schon bearbeitet.", { status: 409 });

  const [client, freelancerEmail] = await Promise.all([
    clientContact(admin, booking.owner_user_id),
    freelancerContactEmail(admin, profile.id, profile.owner_user_id).catch(() => null),
  ]);
  const parties = {
    siteUrl,
    clientName: client.name,
    clientEmail: client.email ?? "",
    freelancerName: profile.display_name,
    freelancerRole: profile.role_title,
    projectTitle,
  };

  let freelancerNotified = false;
  if (freelancerEmail && client.email) {
    const result = await deliverEmail({
      to: freelancerEmail,
      ...introductionForFreelancer({ ...parties, hasCalendar: Boolean(bookingUrl) }),
      kind: "transactional",
    });
    freelancerNotified = result.delivered;
    if (!result.delivered) logEvent("placement_freelancer_mail_failed", { requestId: booking.id, reason: result.reason });
  }

  let clientNotified = false;
  if (client.email) {
    const result = await deliverEmail({
      to: client.email,
      ...introductionForClient({ ...parties, bookingUrl, freelancerNotified }),
      kind: "transactional",
    });
    clientNotified = result.delivered;
    if (!result.delivered) logEvent("placement_client_mail_failed", { requestId: booking.id, reason: result.reason });
  }

  return {
    freelancerReachable: Boolean(freelancerEmail),
    freelancerNotified,
    clientNotified,
    hasCalendar: Boolean(bookingUrl),
    clientUserId: booking.owner_user_id,
  };
}

export async function declinePlacementRequest(id: string, reason: string | null, siteUrl: string) {
  const admin = createAdminSupabaseClient();
  const { booking, profile, projectTitle } = await loadOpenRequest(admin, id);
  const { data: updated, error } = await admin
    .from("intro_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("status", "manual_review")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) throw new Response("Diese Anfrage ist schon bearbeitet.", { status: 409 });

  const client = await clientContact(admin, booking.owner_user_id);
  let clientNotified = false;
  if (client.email) {
    const result = await deliverEmail({
      to: client.email,
      ...declineForClient({
        siteUrl,
        clientName: client.name,
        freelancerName: profile.display_name,
        projectTitle,
        reason,
      }),
      kind: "transactional",
    });
    clientNotified = result.delivered;
    if (!result.delivered) logEvent("placement_decline_mail_failed", { requestId: booking.id, reason: result.reason });
  }
  return { clientNotified, clientUserId: booking.owner_user_id };
}
