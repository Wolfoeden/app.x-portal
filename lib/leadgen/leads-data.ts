import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  LEAD_PAGE_SIZE,
  type LeadMatchFilter,
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
  outreach_state: "draft" | "sending" | "sent" | "failed" | null;
  outreach_subject: string | null;
  /** Der Wortlaut, wie er rausging. Beleg bei einer Rückfrage. */
  outreach_body: string | null;
  outreach_created_at: string | null;
  outreach_sent_at: string | null;
  outreach_failure_reason: string | null;
  outreach_origin: "scheduler" | "admin" | null;
  outreach_cta_url: string | null;
  /**
   * Was der Abgleich ergeben hat. `null` heißt: noch nie abgeglichen —
   * etwas anderes als ein Abgleich ohne Treffer.
   */
  match_status: "ranked" | "needs_clarification" | "no_reliable_match" | null;
  match_count: number | null;
  match_primary_profile_id: string | null;
  match_open_requirements: string[] | null;
  matched_at: string | null;
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
  /**
   * Der Trichter über die ganze Warteschlange: was abgeglichen wurde, was
   * dabei herauskam und was davon zugestellt ist. Die Zahlen gehören
   * zusammen gelesen — einzeln beantworten sie nichts.
   */
  pipeline: LeadPipeline;
};

export type LeadPipeline = {
  gesamt: number;
  offen: number;
  archiviert: number;
  beantwortet: number;
  abgeglichen: number;
  treffer: number;
  ohneTreffer: number;
  verschickt: number;
  gescheitert: number;
  entwuerfe: number;
  /** Vom Tageslauf vorbereitet und noch nicht zugestellt. */
  vorbereitet: number;
  /** Offene Leads, die noch nie gegen den Katalog gehalten wurden. */
  nichtAbgeglichen: number;
  /**
   * Zeilen, deren Lead nicht mehr existiert. Sie erklären, warum die
   * Zahlen der Warteschlange und die des Ergebnisses auseinanderlaufen.
   */
  abgleichOhneLead: number;
  belegOhneLead: number;
  verschicktHeute: number;
  zuletztVerschickt: string | null;
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
  match?: LeadMatchFilter | null;
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
    p_match: options.match ?? null,
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
  // Zwei Aufrufe, weil die eine Zahlenreihe die Warteschlange zählt und
  // die andere quer über drei Tabellen geht. Sie in eine Funktion zu
  // pressen hieße, die Zählung der Liste an den Trichter zu binden.
  const [queue, pipeline] = await Promise.all([
    admin.rpc("admin_leadgen_queue_summary"),
    admin.rpc("admin_leadgen_pipeline_summary"),
  ]);
  const { data, error } = queue;
  if (error) throw error;
  if (pipeline.error) throw pipeline.error;

  const raw = (data ?? {}) as {
    open?: number;
    archived?: number;
    total?: number;
    by_status?: Record<string, number>;
    categories?: { category: string; count: number }[];
  };

  const trichter = (pipeline.data ?? {}) as Record<string, unknown>;
  const zahl = (schluessel: string): number => {
    const wert = Number(trichter[schluessel]);
    return Number.isFinite(wert) ? wert : 0;
  };

  return {
    open: raw.open ?? 0,
    archived: raw.archived ?? 0,
    total: raw.total ?? 0,
    byStatus: raw.by_status ?? {},
    categories: raw.categories ?? [],
    pipeline: {
      gesamt: zahl("gesamt"),
      offen: zahl("offen"),
      archiviert: zahl("archiviert"),
      beantwortet: zahl("beantwortet"),
      abgeglichen: zahl("abgeglichen"),
      treffer: zahl("treffer"),
      ohneTreffer: zahl("ohne_treffer"),
      verschickt: zahl("verschickt"),
      gescheitert: zahl("gescheitert"),
      entwuerfe: zahl("entwuerfe"),
      vorbereitet: zahl("vorbereitet"),
      nichtAbgeglichen: zahl("nicht_abgeglichen"),
      abgleichOhneLead: zahl("abgleich_ohne_lead"),
      belegOhneLead: zahl("beleg_ohne_lead"),
      verschicktHeute: zahl("verschickt_heute"),
      zuletztVerschickt:
        typeof trichter.zuletzt_verschickt === "string"
          ? trichter.zuletzt_verschickt
          : null,
    },
  };
}

const LEAD_COLUMNS =
  "id,recipient_email,recipient_name,company,stellenanzeige,status,category,notes,archived_at,last_contacted_at,created_at,updated_at";

export type Lead = Omit<
  LeadRow,
  | "outreach_state"
  | "outreach_subject"
  | "outreach_body"
  | "outreach_created_at"
  | "outreach_sent_at"
  | "outreach_failure_reason"
  | "outreach_origin"
  | "outreach_cta_url"
  | "match_status"
  | "match_count"
  | "match_primary_profile_id"
  | "match_open_requirements"
  | "matched_at"
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
  /** Der Portal-Link, wie er in dieser Nachricht steht. */
  ctaUrl?: string | null;
  origin?: "scheduler" | "admin" | null;
  /** Siehe savePreparedDraft: Der Beleg trägt den Empfänger selbst. */
  recipientEmail?: string | null;
  company?: string | null;
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
      p_cta_url: input.ctaUrl ?? null,
      p_origin: input.origin ?? null,
      p_recipient_email: input.recipientEmail ?? null,
      p_company: input.company ?? null,
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

/**
 * Wie viele Nachrichten seit Mitternacht zugestellt wurden.
 *
 * Das Tageslimit gehoert dem Tag und nicht dem einzelnen Aufruf. Seit der
 * Durchgang mehrmals am Morgen laeuft, waere ein Deckel je Aufruf die
 * Summe aller Aufrufe — und die haette das Postfach ueberschritten, um das
 * es dabei geht.
 *
 * Gezaehlt wird im Protokoll und nicht in einem Zaehler daneben: Was
 * tatsaechlich rausging, steht dort, und nur dort.
 */
export async function sentSince(from: Date): Promise<number> {
  const admin = requireServiceRole();
  const { count, error } = await admin
    .from("leadgen_outreach")
    .select("id", { count: "exact", head: true })
    .eq("state", "sent")
    .gte("sent_at", from.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export type LeadRun = {
  id: string;
  started_at: string;
  finished_at: string;
  trigger: "scheduler" | "admin";
  /** Was der Durchgang getan hat: abgleichen oder zustellen. */
  kind: "prepare" | "send";
  dry_run: boolean;
  examined: number;
  sent: number;
  archived: number;
  skipped: number;
  remaining: number;
  daily_budget_left: number;
  stopped_by:
    | "queue_empty"
    | "time"
    | "examined"
    | "daily_limit"
    | "outside_window"
    | "nothing_prepared";
};

const RUN_COLUMNS =
  "id,started_at,finished_at,trigger,kind,dry_run,examined,sent,archived,skipped,remaining,daily_budget_left,stopped_by";

/**
 * Was ein Durchgang getan hat.
 *
 * Nur Läufe, die etwas angesehen haben. Der Zeitgeber weckt die Route öfter,
 * als das Versandfenster offen ist; diese Aufrufe als Zeilen zu führen hieße,
 * das Protokoll mit Nichtereignissen zu füllen.
 */
export async function recordLeadRun(input: Omit<LeadRun, "id" | "finished_at">): Promise<void> {
  if (input.examined <= 0) return;
  const admin = requireServiceRole();
  const { error } = await admin.from("leadgen_run").insert({
    started_at: input.started_at,
    trigger: input.trigger,
    kind: input.kind,
    dry_run: input.dry_run,
    examined: input.examined,
    sent: input.sent,
    archived: input.archived,
    skipped: input.skipped,
    remaining: input.remaining,
    daily_budget_left: input.daily_budget_left,
    stopped_by: input.stopped_by,
  });
  // Ein Protokoll, das den Lauf scheitern lässt, ist schlechter als eine
  // fehlende Zeile: Die Nachrichten sind da schon raus.
  if (error) {
    console.error(
      JSON.stringify({ event: "leadgen_run_log_failed", code: error.code }),
    );
  }
}

export async function listLeadRuns(limit = 5): Promise<LeadRun[]> {
  const admin = requireServiceRole();
  const { data, error } = await admin
    .from("leadgen_run")
    .select(RUN_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw error;
  return (data ?? []) as LeadRun[];
}

/**
 * Ein vorbereiteter Entwurf, wie ihn der Versandlauf vorfindet.
 */
export type PreparedDraft = {
  outreach_id: string;
  lead_id: number;
  recipient_email: string;
  subject: string;
  body: string;
  cta_url: string | null;
  prepared_profile_id: string | null;
  prepared_at: string | null;
};

/**
 * Der Entwurf, den der Abgleich hinterlässt.
 *
 * Ersetzt einen vorhandenen Entwurf desselben Leads, statt danebenzuliegen:
 * Ein zweiter Abgleich gegen einen neueren Katalog ist die bessere Auskunft,
 * und zwei Entwürfe für einen Lead wären eine Frage, die niemand stellt.
 */
export async function savePreparedDraft(input: {
  leadId: number;
  subject: string;
  body: string;
  ctaUrl: string | null;
  profileId: string | null;
  preparedAt: Date;
  /**
   * Empfänger und Firma wandern in den Beleg, nicht nur in den Lead.
   * Wird der Lead gelöscht, sagt die Zeile sonst nicht mehr, an wen sie
   * ging — und genau das ist am 8. September passiert.
   */
  recipientEmail: string;
  company: string | null;
}): Promise<void> {
  const admin = requireServiceRole();
  const { error: deleteError } = await admin
    .from("leadgen_outreach")
    .delete()
    .eq("lead_id", input.leadId)
    .eq("state", "draft");
  if (deleteError) throw deleteError;

  const { error } = await admin.from("leadgen_outreach").insert({
    lead_id: input.leadId,
    state: "draft",
    subject: input.subject,
    body: input.body,
    // Kein Modell und keine Credits: Der Text entsteht deterministisch aus
    // dem Profil, nicht aus einer Anfrage an einen Anbieter.
    model: null,
    credits: null,
    created_by: null,
    cta_url: input.ctaUrl,
    origin: "scheduler",
    prepared_profile_id: input.profileId,
    prepared_at: input.preparedAt.toISOString(),
    recipient_email: input.recipientEmail,
    company: input.company,
  });
  if (error) throw error;
}

export async function listPreparedDrafts(limit = 50): Promise<PreparedDraft[]> {
  const admin = requireServiceRole();
  const { data, error } = await admin.rpc("list_leadgen_prepared_drafts", {
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as PreparedDraft[];
}

export type DraftClaimResult =
  | { claimed: true; leadId: number }
  | { claimed: false; reason: "invalid_input" | "already_sent" | "not_a_draft" };

/**
 * Den Entwurf für den Versand beanspruchen: draft wird sending.
 *
 * Derselbe Gedanke wie beim Einzelversand — erst den Anspruch sichern, dann
 * zustellen. Der Zustand sending belegt denselben eindeutigen Index wie ein
 * verschickter Eintrag, deshalb kommt von zwei gleichzeitigen Läufen nur
 * einer durch.
 */
export async function claimPreparedDraft(
  outreachId: string,
): Promise<DraftClaimResult> {
  const admin = requireServiceRole();
  const { data, error } = await admin
    .rpc("claim_leadgen_draft", { p_outreach_id: outreachId })
    .maybeSingle();
  if (error) throw error;

  const row = (data ?? null) as {
    claimed: boolean;
    reason: string | null;
    lead_id: number | null;
  } | null;
  if (!row || !row.claimed || row.lead_id === null) {
    const reason = row?.reason;
    return {
      claimed: false,
      reason:
        reason === "already_sent" || reason === "not_a_draft"
          ? reason
          : "invalid_input",
    };
  }
  return { claimed: true, leadId: row.lead_id };
}

/**
 * Einen Entwurf verwerfen, der nicht mehr trägt, und den Lead zurück in die
 * Warteschlange stellen.
 */
export async function discardPreparedDraft(input: {
  outreachId: string;
  reason: string;
}): Promise<boolean> {
  const admin = requireServiceRole();
  const { data, error } = await admin.rpc("discard_leadgen_draft", {
    p_outreach_id: input.outreachId,
    p_reason: input.reason,
  });
  if (error) throw error;
  return Boolean(data);
}

/**
 * Eine verschickte oder vorbereitete Nachricht, gelesen aus dem Beleg.
 *
 * Nicht aus der Warteschlange: Ein Lead kann gelöscht sein, die Nachricht ist
 * trotzdem rausgegangen. `lead_vorhanden` sagt, ob es die Zeile daneben noch
 * gibt — daran hängt, ob sich der Vorgang noch weiterbearbeiten lässt.
 */
export type OutreachRow = {
  outreach_id: string;
  lead_id: number | null;
  lead_vorhanden: boolean;
  recipient_email: string | null;
  company: string | null;
  state: "draft" | "sending" | "sent" | "failed";
  subject: string;
  body: string;
  cta_url: string | null;
  origin: "scheduler" | "admin" | null;
  model: string | null;
  credits: number | null;
  created_at: string;
  sent_at: string | null;
  prepared_at: string | null;
  prepared_profile_id: string | null;
  failure_reason: string | null;
  stellenanzeige: string | null;
};

export type OutreachListResult = {
  rows: OutreachRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listOutreach(options: {
  state?: "draft" | "sent" | "failed" | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<OutreachListResult> {
  const admin = requireServiceRole();
  const pageSize = Math.min(Math.max(options.pageSize ?? LEAD_PAGE_SIZE, 1), 200);
  const page = Math.max(options.page ?? 1, 1);

  const { data, error } = await admin.rpc("admin_list_leadgen_outreach", {
    p_state: options.state ?? null,
    p_search: orNull(options.search),
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;

  const rows = (data ?? []) as (OutreachRow & { total_count: number | string })[];
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
