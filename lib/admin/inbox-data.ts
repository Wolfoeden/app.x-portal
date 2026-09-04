import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildIntroductionUpdate,
  targetStatusForIntroductionAction,
  type AdminInboxDetail,
  type AdminInboxSnapshot,
  type ContactInboxUpdate,
  type IntroductionAction,
  type IntroductionInboxItem,
  type IntroductionInboxUpdate,
  type IntroductionStatus,
} from "@/lib/admin/inbox";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const ACTIVE_LIST_LIMIT = 200;
const ARCHIVE_LIST_LIMIT = 100;

type ContactSourceRow = {
  id: string;
  full_name: string;
  subject: string;
  source: "contact_form" | "imprint";
  handled_at: string | null;
  created_at: string;
  updated_at: string;
};

type IntroductionSourceRow = {
  id: string;
  owner_user_id: string;
  project_id: string;
  freelancer_profile_id: string;
  intro_policy_snapshot: "free" | "manual_approval";
  status: IntroductionStatus;
  booking_provider: "calendly" | "manual" | null;
  booking_url: string | null;
  booking_reference: string | null;
  requested_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectSourceRow = {
  id: string;
  title: string | null;
  status: string;
};

type FreelancerSourceRow = {
  id: string;
  display_name: string;
  role_title: string;
  booking_url: string | null;
  profile_status: string;
  availability_status: string;
};

type UserProfileSourceRow = {
  id: string;
  display_name: string | null;
};

export class AdminInboxConflictError extends Error {
  constructor(message = "Der Vorgang wurde inzwischen an anderer Stelle geändert.") {
    super(message);
    this.name = "AdminInboxConflictError";
  }
}

export class AdminInboxTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminInboxTransitionError";
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function accountLabel(
  ownerUserId: string,
  displayName: string | null | undefined,
): string {
  return displayName?.trim() || `Konto ${ownerUserId.slice(0, 8)}…`;
}

async function relatedRows(
  admin: SupabaseClient,
  introductions: readonly IntroductionSourceRow[],
) {
  const projectIds = unique(introductions.map((row) => row.project_id));
  const profileIds = unique(
    introductions.map((row) => row.freelancer_profile_id),
  );
  const ownerIds = unique(introductions.map((row) => row.owner_user_id));

  const [projectResult, profileResult, userResult] = await Promise.all([
    projectIds.length
      ? admin
          .from("projects")
          .select("id,title,status")
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? admin
          .from("freelancer_profiles")
          .select(
            "id,display_name,role_title,booking_url,profile_status,availability_status",
          )
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? admin
          .from("user_profiles")
          .select("id,display_name")
          .in("id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (projectResult.error) throw projectResult.error;
  if (profileResult.error) throw profileResult.error;
  if (userResult.error) throw userResult.error;

  return {
    projects: new Map(
      ((projectResult.data ?? []) as ProjectSourceRow[]).map((row) => [
        row.id,
        row,
      ]),
    ),
    profiles: new Map(
      ((profileResult.data ?? []) as FreelancerSourceRow[]).map((row) => [
        row.id,
        row,
      ]),
    ),
    users: new Map(
      ((userResult.data ?? []) as UserProfileSourceRow[]).map((row) => [
        row.id,
        row,
      ]),
    ),
  };
}

/**
 * Bounded operator queue. Full messages and Auth emails intentionally stay out
 * of the page payload until the operator opens one item.
 */
export async function listAdminInbox(): Promise<AdminInboxSnapshot> {
  const admin = createAdminSupabaseClient();
  const [
    openContactResult,
    archivedContactResult,
    openIntroductionResult,
    archivedIntroductionResult,
  ] = await Promise.all([
    admin
      .from("contact_requests")
      .select("id,full_name,subject,source,handled_at,created_at,updated_at")
      .is("handled_at", null)
      .order("created_at", { ascending: true })
      .limit(ACTIVE_LIST_LIMIT + 1),
    admin
      .from("contact_requests")
      .select("id,full_name,subject,source,handled_at,created_at,updated_at")
      .not("handled_at", "is", null)
      .order("updated_at", { ascending: false })
      .limit(ARCHIVE_LIST_LIMIT + 1),
    admin
      .from("intro_bookings")
      .select(
        "id,owner_user_id,project_id,freelancer_profile_id,intro_policy_snapshot,status,booking_provider,booking_url,booking_reference,requested_at,confirmed_at,cancelled_at,created_at,updated_at",
      )
      .in("status", ["requested", "manual_review", "ready_to_book", "booked"])
      .order("requested_at", { ascending: true })
      .limit(ACTIVE_LIST_LIMIT + 1),
    admin
      .from("intro_bookings")
      .select(
        "id,owner_user_id,project_id,freelancer_profile_id,intro_policy_snapshot,status,booking_provider,booking_url,booking_reference,requested_at,confirmed_at,cancelled_at,created_at,updated_at",
      )
      .in("status", ["completed", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(ARCHIVE_LIST_LIMIT + 1),
  ]);

  if (openContactResult.error) throw openContactResult.error;
  if (archivedContactResult.error) throw archivedContactResult.error;
  if (openIntroductionResult.error) throw openIntroductionResult.error;
  if (archivedIntroductionResult.error) throw archivedIntroductionResult.error;

  const openContacts = (openContactResult.data ?? []) as ContactSourceRow[];
  const archivedContacts = (archivedContactResult.data ?? []) as ContactSourceRow[];
  const openIntroductions = (openIntroductionResult.data ?? []) as IntroductionSourceRow[];
  const archivedIntroductions = (archivedIntroductionResult.data ?? []) as IntroductionSourceRow[];
  const contactRows = [
    ...openContacts.slice(0, ACTIVE_LIST_LIMIT),
    ...archivedContacts.slice(0, ARCHIVE_LIST_LIMIT),
  ];
  const introductionRows = [
    ...openIntroductions.slice(0, ACTIVE_LIST_LIMIT),
    ...archivedIntroductions.slice(0, ARCHIVE_LIST_LIMIT),
  ];
  const related = await relatedRows(admin, introductionRows);

  return {
    generatedAt: new Date().toISOString(),
    truncated: {
      contacts:
        openContacts.length > ACTIVE_LIST_LIMIT ||
        archivedContacts.length > ARCHIVE_LIST_LIMIT,
      introductions:
        openIntroductions.length > ACTIVE_LIST_LIMIT ||
        archivedIntroductions.length > ARCHIVE_LIST_LIMIT,
    },
    contacts: contactRows.map((row) => ({
      kind: "contact",
      id: row.id,
      fullName: row.full_name,
      email: null,
      subject: row.subject,
      message: null,
      source: row.source,
      handledAt: row.handled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      detailsLoaded: false,
    })),
    introductions: introductionRows.map((row): IntroductionInboxItem => {
      const project = related.projects.get(row.project_id);
      const profile = related.profiles.get(row.freelancer_profile_id);
      const userProfile = related.users.get(row.owner_user_id);
      return {
        kind: "introduction",
        id: row.id,
        ownerUserId: row.owner_user_id,
        customerName: accountLabel(
          row.owner_user_id,
          userProfile?.display_name,
        ),
        customerEmail: null,
        projectId: row.project_id,
        projectTitle: project?.title?.trim() || "Projekt ohne Titel",
        projectStatus: project?.status ?? "unbekannt",
        freelancerProfileId: row.freelancer_profile_id,
        freelancerName: profile?.display_name ?? "Profil nicht verfügbar",
        freelancerRole: profile?.role_title ?? "Unbekannte Rolle",
        freelancerStatus: profile?.profile_status ?? "unbekannt",
        availabilityStatus: profile?.availability_status ?? "unbekannt",
        introPolicy: row.intro_policy_snapshot,
        status: row.status,
        bookingProvider: row.booking_provider,
        bookingUrl: row.booking_url,
        suggestedBookingUrl: profile?.booking_url ?? null,
        bookingReference: row.booking_reference,
        requestedAt: row.requested_at,
        confirmedAt: row.confirmed_at,
        cancelledAt: row.cancelled_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        detailsLoaded: false,
      };
    }),
  };
}

export async function getAdminInboxDetail(
  kind: "contact" | "introduction",
  id: string,
): Promise<AdminInboxDetail | null> {
  const admin = createAdminSupabaseClient();

  if (kind === "contact") {
    const { data, error } = await admin
      .from("contact_requests")
      .select("id,email,message,source")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      kind,
      id: data.id as string,
      email: data.email as string,
      message: data.message as string,
      source: data.source as "contact_form" | "imprint",
    };
  }

  const { data: booking, error: bookingError } = await admin
    .from("intro_bookings")
    .select("id,owner_user_id")
    .eq("id", id)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) return null;

  const ownerUserId = booking.owner_user_id as string;
  const [authResult, profileResult] = await Promise.all([
    admin.auth.admin.getUserById(ownerUserId),
    admin
      .from("user_profiles")
      .select("display_name")
      .eq("id", ownerUserId)
      .maybeSingle(),
  ]);
  if (authResult.error) throw authResult.error;
  if (profileResult.error) throw profileResult.error;

  const email = authResult.data.user?.email?.trim() || null;
  return {
    kind,
    id: booking.id as string,
    customerName: accountLabel(
      ownerUserId,
      (profileResult.data?.display_name as string | null | undefined) ??
        email?.split("@")[0],
    ),
    customerEmail: email,
  };
}

export async function updateContactInboxItem(input: {
  id: string;
  action: "mark_handled" | "reopen";
  expectedUpdatedAt: string;
}): Promise<ContactInboxUpdate | null> {
  const admin = createAdminSupabaseClient();
  const handledAt =
    input.action === "mark_handled" ? new Date().toISOString() : null;
  const { data, error } = await admin
    .from("contact_requests")
    .update({ handled_at: handledAt })
    .eq("id", input.id)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("id,handled_at,updated_at")
    .maybeSingle();
  if (error) throw error;

  if (data) {
    return {
      kind: "contact",
      id: data.id as string,
      handledAt: data.handled_at as string | null,
      updatedAt: data.updated_at as string,
    };
  }

  const { data: current, error: currentError } = await admin
    .from("contact_requests")
    .select("id,handled_at,updated_at")
    .eq("id", input.id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;

  // Safe retry after an audit/network failure: the desired state is already
  // present, so returning it cannot overwrite somebody else's newer choice.
  const alreadyApplied =
    input.action === "mark_handled"
      ? current.handled_at !== null
      : current.handled_at === null;
  if (alreadyApplied) {
    return {
      kind: "contact",
      id: current.id as string,
      handledAt: current.handled_at as string | null,
      updatedAt: current.updated_at as string,
    };
  }

  throw new AdminInboxConflictError();
}

export async function updateIntroductionInboxItem(input: {
  id: string;
  action: IntroductionAction;
  expectedStatus: IntroductionStatus;
  expectedUpdatedAt: string;
  bookingUrl?: string;
}): Promise<IntroductionInboxUpdate | null> {
  const admin = createAdminSupabaseClient();
  const { data: current, error: currentError } = await admin
    .from("intro_bookings")
    .select(
      "id,status,booking_provider,booking_url,confirmed_at,cancelled_at,updated_at",
    )
    .eq("id", input.id)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;

  const currentItem = {
    id: current.id as string,
    status: current.status as IntroductionStatus,
    bookingProvider: current.booking_provider as
      | "calendly"
      | "manual"
      | null,
    bookingUrl: current.booking_url as string | null,
    confirmedAt: current.confirmed_at as string | null,
    cancelledAt: current.cancelled_at as string | null,
    updatedAt: current.updated_at as string,
  };
  const target = targetStatusForIntroductionAction(input.action);

  // The same action can safely be retried after the database update succeeded
  // but the required application audit or response failed.
  if (currentItem.status === target) {
    return {
      kind: "introduction",
      ...currentItem,
      previousStatus: input.expectedStatus,
    };
  }

  if (
    currentItem.status !== input.expectedStatus ||
    currentItem.updatedAt !== input.expectedUpdatedAt
  ) {
    throw new AdminInboxConflictError();
  }

  let update: IntroductionInboxUpdate;
  try {
    update = buildIntroductionUpdate(
      currentItem,
      input.action,
      new Date().toISOString(),
      input.bookingUrl,
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_transition";
    throw new AdminInboxTransitionError(
      code === "invalid_booking_url"
        ? "Für die Freigabe wird ein gültiger HTTPS-Buchungslink benötigt."
        : "Dieser Statuswechsel ist nicht erlaubt.",
    );
  }

  const patch: Record<string, unknown> = { status: update.status };
  if (input.action === "approve") {
    patch.booking_url = update.bookingUrl;
    patch.booking_provider = update.bookingProvider;
  }
  if (input.action === "mark_booked" && !currentItem.confirmedAt) {
    patch.confirmed_at = update.confirmedAt;
  }
  if (input.action === "cancel") patch.cancelled_at = update.cancelledAt;

  const { data, error } = await admin
    .from("intro_bookings")
    .update(patch)
    .eq("id", input.id)
    .eq("status", input.expectedStatus)
    .eq("updated_at", input.expectedUpdatedAt)
    .select(
      "id,status,booking_provider,booking_url,confirmed_at,cancelled_at,updated_at",
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminInboxConflictError();

  return {
    kind: "introduction",
    id: data.id as string,
    previousStatus: currentItem.status,
    status: data.status as IntroductionStatus,
    bookingProvider: data.booking_provider as
      | "calendly"
      | "manual"
      | null,
    bookingUrl: data.booking_url as string | null,
    confirmedAt: data.confirmed_at as string | null,
    cancelledAt: data.cancelled_at as string | null,
    updatedAt: data.updated_at as string,
  };
}
