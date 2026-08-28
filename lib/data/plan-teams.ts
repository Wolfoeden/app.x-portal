import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Ein Konto gehört zu höchstens einem Team — das erzwingt der
 * Primärschlüssel auf `member_user_id`. Erst diese Eindeutigkeit macht die
 * Frage "wessen Guthaben wird belastet" überhaupt beantwortbar.
 */
export type PlanTeamMember = {
  userId: string;
  email: string | null;
  invitedAt: string;
};

export type PlanTeam = {
  /** Das Konto, dessen Plan das Team trägt. */
  ownerUserId: string;
  ownerEmail: string | null;
  members: PlanTeamMember[];
};

/** Warum eine Einladung nicht ausgesprochen werden konnte. */
export type InviteFailure =
  | "not_registered"
  | "already_in_team"
  | "owns_a_team"
  | "self"
  | "team_full";

export const MAX_TEAM_MEMBERS = 10;

function client() {
  return createAdminSupabaseClient();
}

/**
 * Sucht ein dauerhaftes Konto zu einer Adresse. Gibt bewusst nur die ID
 * zurück: die Einladung darf nicht zum Verzeichnis werden, mit dem sich
 * fremde Konten durchprobieren lassen.
 */
async function findAccountByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const admin = client();
  // listUsers filtert serverseitig nicht nach E-Mail, deshalb die RPC-freie
  // Seitensuche über die Auth-Admin-API mit früherem Abbruch.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find(
      (user) =>
        (user.email ?? "").trim().toLowerCase() === normalized &&
        user.is_anonymous !== true,
    );
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

/**
 * Existiert die Tabelle noch nicht, kann niemand Mitglied sein — "kein Team"
 * ist dann keine Annahme, sondern die Tatsache. Damit lässt sich der Code vor
 * der Migration ausrollen, ohne dass die Merkliste ausfällt. Jeder andere
 * Fehler fliegt weiter: bei einem Mitglied entscheidet diese Antwort darüber,
 * wessen Liste es sieht.
 */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/** Das Team, aus dem dieses Konto bezahlt — oder null, wenn es allein steht. */
export async function findOwnerForMember(
  memberUserId: string,
): Promise<string | null> {
  const { data, error } = await client()
    .from("plan_team_members")
    .select("owner_user_id")
    .eq("member_user_id", memberUserId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return (data as { owner_user_id: string } | null)?.owner_user_id ?? null;
}

/** Die Mitglieder, die aus dem Plan dieses Kontos bezahlen. */
export async function loadTeam(ownerUserId: string): Promise<PlanTeam> {
  const admin = client();
  const { data, error } = await admin
    .from("plan_team_members")
    .select("member_user_id,invited_at")
    .eq("owner_user_id", ownerUserId)
    .order("invited_at", { ascending: true })
    .limit(MAX_TEAM_MEMBERS);
  // Vor der Migration gibt es die Tabelle nicht — dann hat niemand ein Team.
  // Der Dialog zeigt dann ein leeres statt einer Fehlermeldung.
  if (error && !isMissingTable(error)) throw error;

  const rows = (error ? [] : data ?? []) as {
    member_user_id: string;
    invited_at: string;
  }[];
  const members: PlanTeamMember[] = [];
  for (const row of rows) {
    const { data: user } = await admin.auth.admin.getUserById(row.member_user_id);
    members.push({
      userId: row.member_user_id,
      email: user?.user?.email ?? null,
      invitedAt: row.invited_at,
    });
  }

  const { data: owner } = await admin.auth.admin.getUserById(ownerUserId);
  return {
    ownerUserId,
    ownerEmail: owner?.user?.email ?? null,
    members,
  };
}

/**
 * Nimmt ein bestehendes Konto in den Plan auf.
 *
 * Es gibt bewusst keine Einladung an eine unbekannte Adresse: das Feature
 * teilt Guthaben und eine Merkliste, beides braucht ein Konto, an dem es
 * hängen kann. Wer noch keins hat, wird als solcher gemeldet, damit der
 * Einladende ihn selbst anschreiben kann.
 */
export async function addTeamMember(input: {
  ownerUserId: string;
  email: string;
}): Promise<
  | { ok: true; member: PlanTeamMember }
  | { ok: false; reason: InviteFailure }
> {
  const memberUserId = await findAccountByEmail(input.email);
  if (!memberUserId) return { ok: false, reason: "not_registered" };
  if (memberUserId === input.ownerUserId) return { ok: false, reason: "self" };

  const admin = client();

  if (await findOwnerForMember(memberUserId)) {
    return { ok: false, reason: "already_in_team" };
  }

  const { count, error: countError } = await admin
    .from("plan_team_members")
    .select("member_user_id", { count: "exact", head: true })
    .eq("owner_user_id", input.ownerUserId);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_TEAM_MEMBERS) {
    return { ok: false, reason: "team_full" };
  }

  const { data, error } = await admin
    .from("plan_team_members")
    .insert({
      owner_user_id: input.ownerUserId,
      member_user_id: memberUserId,
    })
    .select("member_user_id,invited_at")
    .single();
  if (error) {
    // Der Trigger lehnt Ketten ab; das ist kein Serverfehler, sondern eine
    // Aussage über den eingeladenen Account.
    if (error.code === "42501") return { ok: false, reason: "owns_a_team" };
    throw error;
  }

  const row = data as { member_user_id: string; invited_at: string };
  const { data: user } = await admin.auth.admin.getUserById(row.member_user_id);
  return {
    ok: true,
    member: {
      userId: row.member_user_id,
      email: user?.user?.email ?? null,
      invitedAt: row.invited_at,
    },
  };
}

export async function removeTeamMember(input: {
  ownerUserId: string;
  memberUserId: string;
}): Promise<boolean> {
  const { error, count } = await client()
    .from("plan_team_members")
    .delete({ count: "exact" })
    .eq("owner_user_id", input.ownerUserId)
    .eq("member_user_id", input.memberUserId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
