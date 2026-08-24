import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminAccountKind = "registered" | "guest";

export type AdminAccountRow = {
  userId: string;
  email: string | null;
  kind: AdminAccountKind;
  createdAt: string;
  lastSignInAt: string | null;
  /** When this account last wrote a message — null when it never did. */
  lastActiveAt: string | null;
  projects: number;
  /** Messages the person wrote; assistant replies are not counted. */
  messages: number;
};

export type AdminActivityWindow = {
  /** Accounts that wrote at least one message inside the window. */
  active: number;
  registeredActive: number;
  guestActive: number;
};

export type AdminUserMetrics = {
  generatedAt: string;
  activityWindowDays: number;
  totals: {
    accounts: number;
    registered: number;
    guests: number;
    /** Registered accounts that never signed in again after creation. */
    registeredNeverReturned: number;
  };
  activity: {
    day: AdminActivityWindow;
    week: AdminActivityWindow;
    month: AdminActivityWindow;
  };
  /** Newest first, one entry per day that had at least one signup. */
  registrationsByDay: { date: string; registered: number; guests: number }[];
  /** Registered accounts, newest first. Guests are aggregated, not listed. */
  registeredAccounts: AdminAccountRow[];
  /** Guests with real activity, newest first — the pool worth converting. */
  activeGuests: AdminAccountRow[];
  truncated: boolean;
};

/**
 * Activity is read from a bounded window so the query cost stays flat as the
 * project grows. Anything older than this counts as "not active", never as
 * unknown.
 */
const ACTIVITY_WINDOW_DAYS = 30;
const AUTH_PAGE_SIZE = 1_000;
const AUTH_MAX_PAGES = 20;
const ROW_PAGE_SIZE = 1_000;
const ROW_MAX = 50_000;

type AuthAccount = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  anonymous: boolean;
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function laterOf(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

async function readAuthAccounts(): Promise<{
  accounts: AuthAccount[];
  truncated: boolean;
}> {
  const admin = createAdminSupabaseClient();
  const accounts: AuthAccount[] = [];
  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });
    if (error) throw error;
    for (const user of data.users) {
      accounts.push({
        id: user.id,
        email: user.email?.trim() ? user.email : null,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        // Fail closed: treat a missing flag as a guest so a malformed record
        // never inflates the registered-user count.
        anonymous: user.is_anonymous !== false,
      });
    }
    if (data.users.length < AUTH_PAGE_SIZE) {
      return { accounts, truncated: false };
    }
  }
  return { accounts, truncated: true };
}

async function readOwnerActivity(
  table: "projects" | "messages",
  timestampColumn: "updated_at" | "created_at",
  since: string,
  equals: Readonly<Record<string, string>> = {},
): Promise<Map<string, { count: number; last: string | null }>> {
  const admin = createAdminSupabaseClient();
  const byOwner = new Map<string, { count: number; last: string | null }>();
  for (let offset = 0; offset < ROW_MAX; offset += ROW_PAGE_SIZE) {
    let query = admin
      .from(table)
      .select(`owner_user_id,${timestampColumn}`)
      .gte(timestampColumn, since)
      .order(timestampColumn, { ascending: false })
      .range(offset, offset + ROW_PAGE_SIZE - 1);
    for (const [column, value] of Object.entries(equals)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as {
      owner_user_id: string | null;
      [key: string]: unknown;
    }[];
    for (const row of rows) {
      const owner = row.owner_user_id;
      if (!owner) continue;
      const stamp = row[timestampColumn];
      const at = typeof stamp === "string" ? stamp : null;
      const current = byOwner.get(owner) ?? { count: 0, last: null };
      current.count += 1;
      current.last = laterOf(current.last, at);
      byOwner.set(owner, current);
    }
    if (rows.length < ROW_PAGE_SIZE) break;
  }
  return byOwner;
}

function emptyWindow(): AdminActivityWindow {
  return { active: 0, registeredActive: 0, guestActive: 0 };
}

function countInto(
  window: AdminActivityWindow,
  kind: AdminAccountKind,
): void {
  window.active += 1;
  if (kind === "registered") window.registeredActive += 1;
  else window.guestActive += 1;
}

export function buildUserMetrics(input: {
  accounts: readonly AuthAccount[];
  projects: Map<string, { count: number; last: string | null }>;
  messages: Map<string, { count: number; last: string | null }>;
  now: Date;
  truncated: boolean;
}): AdminUserMetrics {
  const dayAgo = new Date(input.now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(input.now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(
    input.now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const activity = { day: emptyWindow(), week: emptyWindow(), month: emptyWindow() };
  const byDay = new Map<string, { registered: number; guests: number }>();
  const registeredAccounts: AdminAccountRow[] = [];
  const activeGuests: AdminAccountRow[] = [];

  let registered = 0;
  let guests = 0;
  let registeredNeverReturned = 0;

  for (const account of input.accounts) {
    const kind: AdminAccountKind = account.anonymous ? "guest" : "registered";
    const projectActivity = input.projects.get(account.id);
    const messageActivity = input.messages.get(account.id);
    // Activity means the person wrote something. A sign-in on its own is an
    // account event, not usage, and a project row can be touched by the system.
    const lastActiveAt = messageActivity?.last ?? null;

    const row: AdminAccountRow = {
      userId: account.id,
      email: account.email,
      kind,
      createdAt: account.createdAt,
      lastSignInAt: account.lastSignInAt,
      lastActiveAt,
      projects: projectActivity?.count ?? 0,
      messages: messageActivity?.count ?? 0,
    };

    if (kind === "registered") {
      registered += 1;
      registeredAccounts.push(row);
      // A sign-in stamped at creation time is the signup itself, not a return.
      if (!account.lastSignInAt || account.lastSignInAt <= account.createdAt) {
        registeredNeverReturned += 1;
      }
    } else {
      guests += 1;
      if (row.messages > 0) activeGuests.push(row);
    }

    if (lastActiveAt) {
      if (lastActiveAt >= dayAgo) countInto(activity.day, kind);
      if (lastActiveAt >= weekAgo) countInto(activity.week, kind);
      if (lastActiveAt >= monthAgo) countInto(activity.month, kind);
    }

    const date = account.createdAt.slice(0, 10);
    const bucket = byDay.get(date) ?? { registered: 0, guests: 0 };
    if (kind === "registered") bucket.registered += 1;
    else bucket.guests += 1;
    byDay.set(date, bucket);
  }

  const sortByLastActive = (left: AdminAccountRow, right: AdminAccountRow) =>
    (right.lastActiveAt ?? right.createdAt).localeCompare(
      left.lastActiveAt ?? left.createdAt,
    );

  return {
    generatedAt: input.now.toISOString(),
    activityWindowDays: ACTIVITY_WINDOW_DAYS,
    totals: {
      accounts: input.accounts.length,
      registered,
      guests,
      registeredNeverReturned,
    },
    activity,
    registrationsByDay: [...byDay.entries()]
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 30),
    registeredAccounts: registeredAccounts.sort(sortByLastActive),
    activeGuests: activeGuests.sort(sortByLastActive).slice(0, 50),
    truncated: input.truncated,
  };
}

export async function getAdminUserMetrics(): Promise<AdminUserMetrics> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Admin user service is not configured");
  }
  const since = isoDaysAgo(ACTIVITY_WINDOW_DAYS);
  const [auth, projects, messages] = await Promise.all([
    readAuthAccounts(),
    readOwnerActivity("projects", "updated_at", since),
    // Only what the person typed. Assistant replies would double every count
    // and would make a user look active for an answer they did not ask for.
    readOwnerActivity("messages", "created_at", since, { role: "user" }),
  ]);
  return buildUserMetrics({
    accounts: auth.accounts,
    projects,
    messages,
    now: new Date(),
    truncated: auth.truncated,
  });
}
