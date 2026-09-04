export const INTRODUCTION_STATUSES = [
  "requested",
  "manual_review",
  "ready_to_book",
  "booked",
  "completed",
  "cancelled",
] as const;

export type IntroductionStatus = (typeof INTRODUCTION_STATUSES)[number];

export const INTRODUCTION_STATUS_LABELS: Record<IntroductionStatus, string> = {
  requested: "Neu eingegangen",
  manual_review: "Manuelle Prüfung",
  ready_to_book: "Zur Buchung bereit",
  booked: "Termin bestätigt",
  completed: "Gespräch abgeschlossen",
  cancelled: "Abgesagt",
};

export const INTRODUCTION_ACTIONS = [
  "start_review",
  "approve",
  "mark_booked",
  "complete",
  "cancel",
] as const;

export type IntroductionAction = (typeof INTRODUCTION_ACTIONS)[number];

export type ContactInboxItem = {
  kind: "contact";
  id: string;
  fullName: string;
  email: string | null;
  subject: string;
  message: string | null;
  source: "contact_form" | "imprint";
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
  detailsLoaded: boolean;
};

export type IntroductionInboxItem = {
  kind: "introduction";
  id: string;
  ownerUserId: string;
  customerName: string;
  customerEmail: string | null;
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  freelancerProfileId: string;
  freelancerName: string;
  freelancerRole: string;
  freelancerStatus: string;
  availabilityStatus: string;
  introPolicy: "free" | "manual_approval";
  status: IntroductionStatus;
  bookingProvider: "calendly" | "manual" | null;
  bookingUrl: string | null;
  suggestedBookingUrl: string | null;
  bookingReference: string | null;
  requestedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  detailsLoaded: boolean;
};

export type AdminInboxItem = ContactInboxItem | IntroductionInboxItem;

export type AdminInboxSnapshot = {
  generatedAt: string;
  contacts: ContactInboxItem[];
  introductions: IntroductionInboxItem[];
  truncated: {
    contacts: boolean;
    introductions: boolean;
  };
};

export type ContactInboxDetail = {
  kind: "contact";
  id: string;
  email: string;
  message: string;
  source: "contact_form" | "imprint";
};

export type IntroductionInboxDetail = {
  kind: "introduction";
  id: string;
  customerName: string;
  customerEmail: string | null;
};

export type AdminInboxDetail = ContactInboxDetail | IntroductionInboxDetail;

export type ContactInboxUpdate = {
  kind: "contact";
  id: string;
  handledAt: string | null;
  updatedAt: string;
};

export type IntroductionInboxUpdate = {
  kind: "introduction";
  id: string;
  previousStatus: IntroductionStatus;
  status: IntroductionStatus;
  bookingProvider: "calendly" | "manual" | null;
  bookingUrl: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
};

export type AdminInboxUpdate = ContactInboxUpdate | IntroductionInboxUpdate;

const ACTION_TARGET: Record<IntroductionAction, IntroductionStatus> = {
  start_review: "manual_review",
  approve: "ready_to_book",
  mark_booked: "booked",
  complete: "completed",
  cancel: "cancelled",
};

const ALLOWED_TRANSITIONS: Record<
  IntroductionStatus,
  readonly IntroductionStatus[]
> = {
  requested: ["manual_review", "ready_to_book", "cancelled"],
  manual_review: ["ready_to_book", "cancelled"],
  ready_to_book: ["booked", "cancelled"],
  booked: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function targetStatusForIntroductionAction(
  action: IntroductionAction,
): IntroductionStatus {
  return ACTION_TARGET[action];
}

export function canTransitionIntroduction(
  current: IntroductionStatus,
  next: IntroductionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export function primaryIntroductionAction(
  status: IntroductionStatus,
): IntroductionAction | null {
  switch (status) {
    case "requested":
      return "start_review";
    case "manual_review":
      return "approve";
    case "ready_to_book":
      return "mark_booked";
    case "booked":
      return "complete";
    case "completed":
    case "cancelled":
      return null;
  }
}

export function introductionActionLabel(action: IntroductionAction): string {
  switch (action) {
    case "start_review":
      return "Prüfung starten";
    case "approve":
      return "Zur Buchung freigeben";
    case "mark_booked":
      return "Termin bestätigen";
    case "complete":
      return "Gespräch abschließen";
    case "cancel":
      return "Absagen";
  }
}

export function buildIntroductionUpdate(
  item: Pick<
    IntroductionInboxItem,
    | "id"
    | "status"
    | "bookingProvider"
    | "bookingUrl"
    | "confirmedAt"
    | "cancelledAt"
    | "updatedAt"
  >,
  action: IntroductionAction,
  now: string,
  bookingUrl?: string,
): IntroductionInboxUpdate {
  const next = targetStatusForIntroductionAction(action);
  if (!canTransitionIntroduction(item.status, next)) {
    throw new Error(`invalid_introduction_transition:${item.status}:${next}`);
  }

  let nextBookingUrl = item.bookingUrl;
  let nextBookingProvider = item.bookingProvider;
  if (action === "approve") {
    const candidate = bookingUrl?.trim() ?? "";
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error("invalid_booking_url");
    }
    if (parsed.protocol !== "https:") throw new Error("invalid_booking_url");
    nextBookingUrl = parsed.toString();
    nextBookingProvider =
      parsed.hostname === "calendly.com" ||
      parsed.hostname.endsWith(".calendly.com")
        ? "calendly"
        : "manual";
  }

  return {
    kind: "introduction",
    id: item.id,
    previousStatus: item.status,
    status: next,
    bookingProvider: nextBookingProvider,
    bookingUrl: nextBookingUrl,
    confirmedAt:
      action === "mark_booked" ? item.confirmedAt ?? now : item.confirmedAt,
    cancelledAt: action === "cancel" ? now : item.cancelledAt,
    updatedAt: now,
  };
}

export function isOpenInboxItem(item: AdminInboxItem): boolean {
  return item.kind === "contact"
    ? item.handledAt === null
    : item.status !== "completed" && item.status !== "cancelled";
}

export function inboxItemTimestamp(item: AdminInboxItem): string {
  return item.kind === "contact" ? item.createdAt : item.requestedAt;
}

function workPriority(item: AdminInboxItem): number {
  if (!isOpenInboxItem(item)) return 4;
  if (item.kind === "contact") return 0;
  if (item.status === "requested" || item.status === "manual_review") return 0;
  if (item.status === "ready_to_book") return 1;
  return 2;
}

export function buildInboxQueue(snapshot: AdminInboxSnapshot): AdminInboxItem[] {
  return [...snapshot.contacts, ...snapshot.introductions].sort((left, right) => {
    const priority = workPriority(left) - workPriority(right);
    if (priority !== 0) return priority;

    const leftStamp = inboxItemTimestamp(left);
    const rightStamp = inboxItemTimestamp(right);
    // Offene Arbeit: ältester Vorgang zuerst. Archiv: neueste Änderung zuerst.
    return isOpenInboxItem(left)
      ? leftStamp.localeCompare(rightStamp)
      : right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function summarizeInbox(snapshot: AdminInboxSnapshot) {
  const items = [...snapshot.contacts, ...snapshot.introductions];
  const open = items.filter(isOpenInboxItem);
  const decisionCount = snapshot.introductions.filter(
    (item) => item.status === "requested" || item.status === "manual_review",
  ).length;

  return {
    total: items.length,
    open: open.length,
    archived: items.length - open.length,
    contacts: snapshot.contacts.length,
    introductions: snapshot.introductions.length,
    decisions: decisionCount,
    oldestOpenAt: open
      .map(inboxItemTimestamp)
      .sort((left, right) => left.localeCompare(right))[0] ?? null,
  };
}
