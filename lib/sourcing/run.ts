import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Die Belege der Beschaffung für die Nachfrageseite: verschickte Einladungen
 * und frühere Suchläufe.
 *
 * Hier stand einmal auch ein Beschaffungslauf gegen freelancermap und der
 * Versand von Einladungen an recherchierte Freelancer. Beides ist
 * zurückgebaut, der Versand am 19.10.2026: Er hatte keinen Aufrufer. Übrig
 * bleiben die Belege aus der Zeit davor.
 */

export type SourcingOutreachRow = {
  id: string;
  createdAt: string;
  recipientEmail: string;
  recipientName: string | null;
  demandProfileLabel: string | null;
  profileUrl: string | null;
  channel: string;
  subject: string | null;
  status: "sent" | "failed" | "suppressed" | "manual";
  error: string | null;
};

/**
 * Die verschickten Einladungen für die Nachfrageseite.
 *
 * Ohne Nachrichtentext: Die Übersicht soll zeigen, **wer wann was** bekommen
 * hat. Wer den Wortlaut braucht, öffnet den Einzelfall — ein Listenaufruf
 * soll nicht dutzendweise Nachrichtentexte durch die Anwendung tragen.
 */
export async function listSourcingOutreach(
  limit = 50,
): Promise<SourcingOutreachRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("sourcing_outreach")
    .select(
      "id,created_at,recipient_email,recipient_name,demand_profile_label,profile_url,channel,subject,status,error",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;

  return (data ?? []).map((row) => {
    const zeile = row as Record<string, unknown>;
    return {
      id: String(zeile.id),
      createdAt: String(zeile.created_at),
      recipientEmail: String(zeile.recipient_email),
      recipientName: (zeile.recipient_name as string | null) ?? null,
      demandProfileLabel: (zeile.demand_profile_label as string | null) ?? null,
      profileUrl: (zeile.profile_url as string | null) ?? null,
      channel: String(zeile.channel),
      status: zeile.status as SourcingOutreachRow["status"],
      subject: (zeile.subject as string | null) ?? null,
      error: (zeile.error as string | null) ?? null,
    };
  });
}

export type SourcingOutreachBody = {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string | null;
  body: string | null;
  status: SourcingOutreachRow["status"];
  error: string | null;
  createdAt: string;
};

/**
 * Der Wortlaut einer einzelnen Nachricht.
 *
 * Getrennt von der Liste, damit der Text nur dann durch die Anwendung geht,
 * wenn ihn jemand sehen will. Auch eine gescheiterte Nachricht hat einen
 * Grund, und der gehört mit ausgegeben — sonst steht dort ein leeres Feld und
 * niemand weiß, ob der Text fehlt oder der Versand.
 */
export async function readSourcingOutreachBody(
  id: string,
): Promise<SourcingOutreachBody | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("sourcing_outreach")
    .select(
      "id,recipient_email,recipient_name,subject,body_text,status,error,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const zeile = data as Record<string, unknown>;
  return {
    id: String(zeile.id),
    recipientEmail: String(zeile.recipient_email),
    recipientName: (zeile.recipient_name as string | null) ?? null,
    subject: (zeile.subject as string | null) ?? null,
    body: (zeile.body_text as string | null) ?? null,
    status: zeile.status as SourcingOutreachRow["status"],
    error: (zeile.error as string | null) ?? null,
    createdAt: String(zeile.created_at),
  };
}

export type SourcingRunRow = {
  id: string;
  createdAt: string;
  demandProfileLabel: string;
  skills: string[];
  foundCount: number;
  addressableCount: number;
  importedCount: number;
  skippedSkills: string[];
};

/** Die letzten Beschaffungsläufe, für die Nachfrageseite. */
export async function listSourcingRuns(limit = 20): Promise<SourcingRunRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("sourcing_runs")
    .select(
      "id,created_at,demand_profile_label,skills,found_count,addressable_count,imported_count,skipped_skills",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;

  return (data ?? []).map((row) => {
    const zeile = row as Record<string, unknown>;
    return {
      id: String(zeile.id),
      createdAt: String(zeile.created_at),
      demandProfileLabel: String(zeile.demand_profile_label),
      skills: (zeile.skills as string[] | null) ?? [],
      foundCount: Number(zeile.found_count ?? 0),
      addressableCount: Number(zeile.addressable_count ?? 0),
      importedCount: Number(zeile.imported_count ?? 0),
      skippedSkills: (zeile.skipped_skills as string[] | null) ?? [],
    };
  });
}
