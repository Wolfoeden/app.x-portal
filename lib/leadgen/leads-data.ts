import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  LEAD_PAGE_SIZE,
  type LeadScope,
  type LeadStatus,
} from "./limits";

/**
 * Der Zugriff auf `leadgen_queue`.
 *
 * Die Tabelle gehört keinem angemeldeten Nutzer: sie wird von einem Werkzeug
 * außerhalb der Anwendung befüllt und ausschließlich vom Betreiber gelesen.
 * Deshalb läuft jeder Zugriff über den Service-Role-Schlüssel, und die
 * Berechtigung prüft die aufrufende Route, nicht die Datenbank.
 *
 * Gesucht wird über `admin_list_leadgen_queue`. Der Umweg über eine Funktion
 * ist Absicht: als zusammengesetzter Filterausdruck im Anwendungscode wäre
 * der Suchbegriff Teil der Abfragesyntax, und ein Komma darin würde sie
 * zerlegen. So bleibt er ein Parameter.
 */

export type LeadRow = {
  id: number;
  recipient_email: string;
  recipient_name: string | null;
  company: string | null;
  stellenanzeige: string;
  status: LeadStatus;
  category: string | null;
  notes: string | null;
  archived_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  outreach_state: "draft" | "sent" | "failed" | null;
  outreach_subject: string | null;
  outreach_created_at: string | null;
};

type LeadListRow = LeadRow & { total_count: number | string };

export type LeadListResult = {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type LeadSummary = {
  open: number;
  archived: number;
  total: number;
  byStatus: Record<string, number>;
  categories: { category: string; count: number }[];
};

function requireServiceRole(): ReturnType<typeof createAdminSupabaseClient> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Response(
      "Die serverseitige Supabase-Konfiguration ist unvollständig.",
      { status: 503 },
    );
  }
  return createAdminSupabaseClient();
}

/**
 * Ein leerer Suchbegriff ist keine Suche. `null` statt `''`, sonst filtert
 * die Funktion auf `ilike '%%'` und der Index bleibt ungenutzt.
 */
function orNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listLeads(options: {
  search?: string | null;
  status?: LeadStatus | null;
  category?: string | null;
  scope?: LeadScope;
  page?: number;
  pageSize?: number;
}): Promise<LeadListResult> {
  const admin = requireServiceRole();
  const pageSize = Math.min(Math.max(options.pageSize ?? LEAD_PAGE_SIZE, 1), 200);
  const page = Math.max(options.page ?? 1, 1);

  const { data, error } = await admin.rpc("admin_list_leadgen_queue", {
    p_search: orNull(options.search),
    p_status: options.status ?? null,
    p_category: orNull(options.category),
    p_scope: options.scope ?? "open",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;

  const rows = (data ?? []) as LeadListRow[];
  // Die Gesamtzahl steht in jeder Zeile, weil sie im selben Durchlauf
  // entsteht. Ohne Zeilen ist sie null — dann gibt es auch nichts zu zählen.
  const total = rows.length ? Number(rows[0].total_count) : 0;

  return {
    rows: rows.map((row) => {
      const { total_count, ...rest } = row;
      void total_count;
      return rest;
    }),
    total: Number.isFinite(total) ? total : 0,
    page,
    pageSize,
  };
}

export async function leadSummary(): Promise<LeadSummary> {
  const admin = requireServiceRole();
  const { data, error } = await admin.rpc("admin_leadgen_queue_summary");
  if (error) throw error;

  const raw = (data ?? {}) as {
    open?: number;
    archived?: number;
    total?: number;
    by_status?: Record<string, number>;
    categories?: { category: string; count: number }[];
  };

  return {
    open: raw.open ?? 0,
    archived: raw.archived ?? 0,
    total: raw.total ?? 0,
    byStatus: raw.by_status ?? {},
    categories: raw.categories ?? [],
  };
}

const LEAD_COLUMNS =
  "id,recipient_email,recipient_name,company,stellenanzeige,status,category,notes,archived_at,last_contacted_at,created_at,updated_at";

export type Lead = Omit<
  LeadRow,
  "outreach_state" | "outreach_subject" | "outreach_created_at"
>;

export async function getLead(id: number): Promise<Lead | null> {
  const admin = requireServiceRole();
  const { data, error } = await admin
    .from("leadgen_queue")
    .select(LEAD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Lead | null) ?? null;
}

/**
 * Kategorie, Notiz, Status und Archivierung ändern.
 *
 * `archived` wird nicht als Zeitpunkt übergeben, sondern als Absicht: die
 * Datenbank setzt `now()`. Ein aus dem Browser gereichter Zeitpunkt hätte
 * hier nichts zu suchen.
 */
export async function updateLead(input: {
  id: number;
  status?: LeadStatus;
  category?: string | null;
  notes?: string | null;
  archived?: boolean;
}): Promise<Lead | null> {
  const admin = requireServiceRole();
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.category !== undefined) {
    patch.category = input.category?.trim() ? input.category.trim() : null;
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes?.trim() ? input.notes : null;
  }
  if (input.archived !== undefined) {
    patch.archived_at = input.archived ? new Date().toISOString() : null;
  }
  if (!Object.keys(patch).length) return getLead(input.id);

  const { data, error } = await admin
    .from("leadgen_queue")
    .update(patch)
    .eq("id", input.id)
    .select(LEAD_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as Lead | null) ?? null;
}

export type OutreachRecord = {
  id: string;
  lead_id: number;
  state: "draft" | "sent" | "failed";
  subject: string;
  body: string;
  model: string | null;
  credits: number | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
  failure_reason: string | null;
};

const OUTREACH_COLUMNS =
  "id,lead_id,state,subject,body,model,credits,created_by,created_at,sent_at,failure_reason";

export async function getOutreachDraft(
  leadId: number,
): Promise<OutreachRecord | null> {
  const admin = requireServiceRole();
  const { data, error } = await admin
    .from("leadgen_outreach")
    .select(OUTREACH_COLUMNS)
    .eq("lead_id", leadId)
    .eq("state", "draft")
    .maybeSingle();
  if (error) throw error;
  return (data as OutreachRecord | null) ?? null;
}

export async function listOutreachForLead(
  leadId: number,
): Promise<OutreachRecord[]> {
  const admin = requireServiceRole();
  const { data, error } = await admin
    .from("leadgen_outreach")
    .select(OUTREACH_COLUMNS)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as OutreachRecord[];
}

/**
 * Legt den Entwurf ab und ersetzt dabei einen älteren.
 *
 * Zwei Schritte statt eines `upsert`, weil der eindeutige Teilindex nur für
 * `state = 'draft'` gilt und `upsert` darauf nicht zielen kann.
 */
export async function saveOutreachDraft(input: {
  leadId: number;
  subject: string;
  body: string;
  model: string | null;
  credits: number | null;
  createdBy: string | null;
}): Promise<OutreachRecord> {
  const admin = requireServiceRole();
  const { error: deleteError } = await admin
    .from("leadgen_outreach")
    .delete()
    .eq("lead_id", input.leadId)
    .eq("state", "draft");
  if (deleteError) throw deleteError;

  const { data, error } = await admin
    .from("leadgen_outreach")
    .insert({
      lead_id: input.leadId,
      state: "draft",
      subject: input.subject,
      body: input.body,
      model: input.model,
      credits: input.credits,
      created_by: input.createdBy,
    })
    .select(OUTREACH_COLUMNS)
    .single();
  if (error) throw error;
  return data as OutreachRecord;
}

export type ClaimResult =
  | { claimed: true; outreachId: string }
  | {
      claimed: false;
      reason: "invalid_input" | "lead_not_found" | "already_sent";
    };

/**
 * Belegt den Lead, bevor der Mailserver überhaupt angesprochen wird.
 *
 * Der Eintrag entsteht im Zustand `sending` und belegt denselben eindeutigen
 * Index wie ein verschickter. Damit ist die Reihenfolge umgedreht: erst den
 * Anspruch sichern, dann zustellen. Andersherum lag der Versand zwischen
 * Prüfung und Protokoll, und zwei gleichzeitige Läufe konnten beide zustellen,
 * bevor einer von ihnen den Konflikt bemerkte.
 */
export async function claimOutreach(input: {
  leadId: number;
  subject: string;
  body: string;
  model: string | null;
  credits: number | null;
  createdBy: string | null;
}): Promise<ClaimResult> {
  const admin = requireServiceRole();
  const { data, error } = await admin
    .rpc("claim_leadgen_outreach", {
      p_lead_id: input.leadId,
      p_subject: input.subject,
      p_body: input.body,
      p_model: input.model,
      p_credits: input.credits,
      p_created_by: input.createdBy,
    })
    .maybeSingle();
  if (error) throw error;

  const row = (data ?? null) as {
    claimed: boolean;
    reason: string | null;
    outreach_id: string | null;
  } | null;
  if (!row || !row.claimed || !row.outreach_id) {
    const reason = row?.reason;
    return {
      claimed: false,
      reason:
        reason === "lead_not_found" || reason === "already_sent"
          ? reason
          : "invalid_input",
    };
  }
  return { claimed: true, outreachId: row.outreach_id };
}

export type SendRecordResult =
  | { recorded: true; outreachId: string }
  | { recorded: false; reason: "not_claimed" };

/**
 * Schließt den beanspruchten Versand ab und archiviert den Lead.
 *
 * Die Zeile liegt bereits vor; sie wechselt nur den Zustand. Zwischen
 * Zustellung und Protokoll kann deshalb nichts mehr verlorengehen — der Beleg
 * war vor dem Versand da, es fehlt danach nur noch der Zeitpunkt.
 */
export async function recordOutreachSent(
  outreachId: string,
): Promise<SendRecordResult> {
  const admin = requireServiceRole();
  const { data, error } = await admin
    .rpc("record_leadgen_outreach_sent", { p_outreach_id: outreachId })
    .maybeSingle();
  if (error) throw error;

  const row = (data ?? null) as {
    recorded: boolean;
    outreach_id: string | null;
  } | null;
  if (!row || !row.recorded || !row.outreach_id) {
    return { recorded: false, reason: "not_claimed" };
  }
  return { recorded: true, outreachId: row.outreach_id };
}

/**
 * Gibt den Anspruch nach einem gescheiterten Versand wieder frei.
 *
 * Der Eintrag bleibt als `failed` stehen — der Versuch gehört ins Protokoll —,
 * belegt den Lead aber nicht mehr. Ein zweiter Anlauf ist damit möglich, und
 * der Lead bleibt in der Arbeitsliste, weil an ihm noch etwas zu tun ist.
 */
export async function releaseOutreachClaim(input: {
  outreachId: string;
  reason: string;
}): Promise<void> {
  const admin = requireServiceRole();
  const { error } = await admin.rpc("release_leadgen_outreach_claim", {
    p_outreach_id: input.outreachId,
    p_reason: input.reason.slice(0, 200),
  });
  if (error) throw error;
}

/**
 * Wann dieselbe Adresse zuletzt etwas von uns bekommen hat.
 *
 * Nicht als Sperre gedacht — eine Agentur schreibt mehrere Projekte aus, und
 * jedes ist ein eigener Anlass. Die Zeile in der Oberfläche soll aber sagen
 * können, dass hier vor drei Tagen schon einmal jemand geschrieben hat.
 */
export async function lastContactForEmails(
  emails: readonly string[],
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(emails.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  );
  if (!unique.length) return new Map();

  const admin = requireServiceRole();
  const { data, error } = await admin
    .from("leadgen_queue")
    .select("recipient_email,last_contacted_at")
    .in("recipient_email", unique)
    .not("last_contacted_at", "is", null)
    .order("last_contacted_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const seen = new Map<string, string>();
  for (const row of (data ?? []) as {
    recipient_email: string;
    last_contacted_at: string;
  }[]) {
    const key = row.recipient_email.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, row.last_contacted_at);
  }
  return seen;
}

/**
 * Räumt einen Entwurf weg, der nicht verschickt werden darf.
 *
 * Er wird nicht gelöscht, sondern auf `failed` umgeschrieben: der Anbieter
 * wurde für ihn bezahlt, und wofür Credits geflossen sind, soll nachvollziehbar
 * bleiben. Gleichzeitig gibt er den Teilindex frei, damit ein neuer Versuch
 * einen frischen Entwurf ablegen kann — und die Zeile in der Übersicht meldet
 * nicht länger einen Entwurf, der bereitläge.
 */
export async function rejectOutreachDraft(input: {
  leadId: number;
  reason: string;
  createdBy: string | null;
}): Promise<void> {
  const admin = requireServiceRole();
  const { error } = await admin
    .from("leadgen_outreach")
    .update({
      state: "failed",
      failure_reason: input.reason.slice(0, 200),
      created_by: input.createdBy,
    })
    .eq("lead_id", input.leadId)
    .eq("state", "draft");
  if (error) throw error;
}
