import "server-only";

import { writeAuditEvent } from "@/lib/audit/write";
import { SALES_CALL_KIND } from "@/lib/sales/sales-call-links";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  CONTACT_STAGES,
  EMAIL_KINDS,
  OPEN_CONTACT_STAGES,
  contactDedupeKey,
  isContactStage,
  type Contact,
  type ContactEvent,
  type ContactInput,
  type ContactStage,
  type EmailKind,
} from "./contacts-model";

/**
 * Lesen und Schreiben der Kontakte (public.crm_contacts) mit Verlauf
 * (public.crm_contact_events). Nur über den Dienstschlüssel; die Tabellen
 * sind für anon und authenticated gesperrt.
 *
 * Ins Audit-Protokoll kommt, was getan wurde, nicht mit wem: keine Namen,
 * keine Adressen — die Kennung des Kontakts genügt.
 */

const COLUMNS =
  "id,company,contact_name,role_title,kind,region,focus,email,email_kind,email_source_url,project_url,note,source,stage,next_follow_up_on,last_contacted_at,created_at,updated_at";

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toContact(row: Row): Contact {
  const emailKind = (EMAIL_KINDS as readonly unknown[]).includes(row.email_kind)
    ? (row.email_kind as EmailKind)
    : "unknown";
  return {
    id: String(row.id),
    company: String(row.company ?? ""),
    contactName: text(row.contact_name),
    roleTitle: text(row.role_title),
    kind: text(row.kind),
    region: text(row.region),
    focus: text(row.focus),
    email: text(row.email),
    emailKind,
    emailSourceUrl: text(row.email_source_url),
    projectUrl: text(row.project_url),
    note: text(row.note),
    source: String(row.source ?? "manual"),
    stage: isContactStage(row.stage) ? row.stage : "new",
    nextFollowUpOn: text(row.next_follow_up_on),
    lastContactedAt: text(row.last_contacted_at),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export const CONTACTS_PAGE_SIZE = 50;

export type ContactFilter = {
  search: string | null;
  stage: ContactStage | "open" | null;
  kind: string | null;
  /** Nur mit Adresse, nur ohne, oder alle. */
  email: "with" | "without" | null;
  due: boolean;
  today: string;
  page: number;
};

/** Suchtext für ilike: Platzhalter und Kommas würden den Filter sprengen. */
function searchPattern(value: string): string {
  return `%${value.replace(/[%_,()\\]/gu, " ").trim()}%`;
}

export async function listContacts(filter: ContactFilter): Promise<{ rows: Contact[]; total: number; pageSize: number }> {
  const admin = createAdminSupabaseClient();
  let query = admin.from("crm_contacts").select(COLUMNS, { count: "exact" });

  if (filter.stage === "open") query = query.in("stage", [...OPEN_CONTACT_STAGES]);
  else if (filter.stage) query = query.eq("stage", filter.stage);
  if (filter.kind) query = query.eq("kind", filter.kind);
  if (filter.email === "with") query = query.not("email", "is", null);
  if (filter.email === "without") query = query.is("email", null);
  if (filter.due) {
    query = query.lte("next_follow_up_on", filter.today).in("stage", [...OPEN_CONTACT_STAGES]);
  }
  if (filter.search) {
    const pattern = searchPattern(filter.search);
    query = query.or(
      `company.ilike.${pattern},contact_name.ilike.${pattern},email.ilike.${pattern},focus.ilike.${pattern},region.ilike.${pattern}`,
    );
  }

  const from = (Math.max(filter.page, 1) - 1) * CONTACTS_PAGE_SIZE;
  const { data, error, count } = await query
    .order("next_follow_up_on", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(from, from + CONTACTS_PAGE_SIZE - 1);
  if (error) throw error;
  return { rows: ((data ?? []) as Row[]).map(toContact), total: count ?? 0, pageSize: CONTACTS_PAGE_SIZE };
}

export type ContactSummary = {
  total: number;
  byStage: Record<ContactStage, number>;
  withEmail: number;
  due: number;
  kinds: string[];
};

export async function contactSummary(today: string): Promise<ContactSummary> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("crm_contacts")
    .select("stage,email,kind,next_follow_up_on")
    .limit(10_000);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const byStage = Object.fromEntries(CONTACT_STAGES.map((stage) => [stage, 0])) as Record<ContactStage, number>;
  let withEmail = 0;
  let due = 0;
  const kinds = new Set<string>();
  for (const row of rows) {
    const stage = isContactStage(row.stage) ? row.stage : "new";
    byStage[stage] += 1;
    if (text(row.email)) withEmail += 1;
    const kind = text(row.kind);
    if (kind) kinds.add(kind);
    const followUp = text(row.next_follow_up_on);
    if (followUp && followUp <= today && (OPEN_CONTACT_STAGES as readonly string[]).includes(stage)) due += 1;
  }
  return {
    total: rows.length,
    byStage,
    withEmail,
    due,
    kinds: [...kinds].sort((a, b) => a.localeCompare(b, "de-DE")),
  };
}

export async function getContact(id: string): Promise<{ contact: Contact; events: ContactEvent[] } | null> {
  const admin = createAdminSupabaseClient();
  const [{ data, error }, events] = await Promise.all([
    admin.from("crm_contacts").select(COLUMNS).eq("id", id).maybeSingle(),
    admin
      .from("crm_contact_events")
      .select("id,kind,body,from_stage,to_stage,created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (error) throw error;
  if (events.error) throw events.error;
  if (!data) return null;
  return {
    contact: toContact(data as Row),
    events: ((events.data ?? []) as Row[]).map((row) => ({
      id: String(row.id),
      kind: row.kind as ContactEvent["kind"],
      body: text(row.body),
      fromStage: isContactStage(row.from_stage) ? row.from_stage : null,
      toStage: isContactStage(row.to_stage) ? row.to_stage : null,
      createdAt: String(row.created_at),
    })),
  };
}

function inputRow(contact: ContactInput): Row {
  return {
    company: contact.company,
    contact_name: contact.contactName,
    role_title: contact.roleTitle,
    kind: contact.kind,
    region: contact.region,
    focus: contact.focus,
    email: contact.email,
    email_kind: contact.emailKind,
    email_source_url: contact.emailSourceUrl,
    project_url: contact.projectUrl,
    note: contact.note,
  };
}

export type ImportResult = { created: number; updated: number };

/**
 * Übernimmt Kontakte aus einer Tabelle. Bekannte Kontakte (gleicher
 * Schlüssel) bekommen die neuen Angaben, behalten aber Stufe, Wiedervorlage
 * und Verlauf — ein zweiter Import setzt niemanden auf „Neu“ zurück.
 */
export async function importContacts(
  contacts: readonly ContactInput[],
  adminId: string,
  source: string,
): Promise<ImportResult> {
  if (!contacts.length) return { created: 0, updated: 0 };
  const admin = createAdminSupabaseClient();
  const keys = contacts.map(contactDedupeKey);

  const existing = new Set<string>();
  for (let index = 0; index < keys.length; index += 200) {
    const { data, error } = await admin
      .from("crm_contacts")
      .select("dedupe_key")
      .in("dedupe_key", keys.slice(index, index + 200));
    if (error) throw error;
    for (const row of (data ?? []) as Row[]) existing.add(String(row.dedupe_key));
  }

  const now = new Date().toISOString();
  // Getrennt einfügen und aktualisieren: Ein gemischter Stapel bekäme für
  // fehlende Spalten NULL statt der Vorgabe, und `source` darf nicht leer sein.
  const fresh: Row[] = [];
  const known: Row[] = [];
  contacts.forEach((contact, index) => {
    const row = { ...inputRow(contact), dedupe_key: keys[index], updated_at: now, updated_by: adminId };
    if (existing.has(keys[index]!)) known.push(row);
    else fresh.push({ ...row, source: source.slice(0, 80), created_by: adminId });
  });

  const created: string[] = [];
  for (let index = 0; index < fresh.length; index += 200) {
    const { data, error } = await admin
      .from("crm_contacts")
      .insert(fresh.slice(index, index + 200))
      .select("id");
    if (error) throw error;
    for (const row of (data ?? []) as Row[]) created.push(String(row.id));
  }
  for (let index = 0; index < known.length; index += 200) {
    const { error } = await admin
      .from("crm_contacts")
      .upsert(known.slice(index, index + 200), { onConflict: "dedupe_key" });
    if (error) throw error;
  }

  if (created.length) {
    const { error } = await admin.from("crm_contact_events").insert(
      created.map((id) => ({
        contact_id: id,
        kind: "imported",
        body: `Importiert (${source.slice(0, 80)})`,
        actor_user_id: adminId,
      })),
    );
    if (error) throw error;
  }

  await writeAuditEvent({
    actorUserId: adminId,
    action: "crm_contacts_imported",
    targetType: "crm_contacts",
    outcome: "success",
    metadata: { created: created.length, updated: contacts.length - created.length, source: source.slice(0, 80) },
  });

  return { created: created.length, updated: contacts.length - created.length };
}

export type ContactPatch = Partial<{
  stage: ContactStage;
  nextFollowUpOn: string | null;
  note: string | null;
  email: string | null;
  contactName: string | null;
  roleTitle: string | null;
  /** Setzt „zuletzt kontaktiert“ auf jetzt und schreibt einen Eintrag. */
  markContacted: boolean;
  /** Ein neuer Eintrag im Verlauf, ändert keine Felder. */
  addNote: string;
}>;

export async function updateContact(id: string, patch: ContactPatch, adminId: string): Promise<Contact | null> {
  const admin = createAdminSupabaseClient();
  const current = await getContact(id);
  if (!current) return null;
  const before = current.contact;

  const row: Row = { updated_at: new Date().toISOString(), updated_by: adminId };
  const events: Row[] = [];
  let stage = before.stage;

  if (patch.markContacted) {
    row.last_contacted_at = new Date().toISOString();
    if (before.stage === "new") stage = "contacted";
    events.push({ kind: "mail_drafted", body: "Mail aus dem Postfach geschrieben" });
  }
  if (patch.stage && patch.stage !== before.stage) stage = patch.stage;
  if (stage !== before.stage) {
    row.stage = stage;
    events.push({ kind: "stage", from_stage: before.stage, to_stage: stage });
    // Ein Widerspruch oder ein Nein beendet die Wiedervorlage.
    if (stage === "do_not_contact" || stage === "not_interested" || stage === "customer") {
      row.next_follow_up_on = null;
    }
  }
  if (patch.nextFollowUpOn !== undefined && !(stage === "do_not_contact" || stage === "not_interested")) {
    row.next_follow_up_on = patch.nextFollowUpOn;
  }
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  if (patch.roleTitle !== undefined) row.role_title = patch.roleTitle;
  if (patch.email !== undefined || patch.contactName !== undefined) {
    // Der Schlüssel folgt den Angaben, sonst legte der nächste Import den
    // geänderten Kontakt ein zweites Mal an.
    row.dedupe_key = contactDedupeKey({
      company: before.company,
      contactName: patch.contactName !== undefined ? patch.contactName : before.contactName,
      email: patch.email !== undefined ? patch.email : before.email,
    });
  }
  if (patch.addNote?.trim()) events.push({ kind: "note", body: patch.addNote.trim().slice(0, 2000) });

  const { data, error } = await admin.from("crm_contacts").update(row).eq("id", id).select(COLUMNS).maybeSingle();
  if (error) throw error;
  if (events.length) {
    const insert = await admin
      .from("crm_contact_events")
      .insert(events.map((event) => ({ ...event, contact_id: id, actor_user_id: adminId })));
    if (insert.error) throw insert.error;
  }

  await writeAuditEvent({
    actorUserId: adminId,
    action: "crm_contact_updated",
    targetType: "crm_contacts",
    targetId: id,
    outcome: "success",
    metadata: {
      stage: stage !== before.stage ? stage : null,
      contacted: Boolean(patch.markContacted),
      note: Boolean(patch.addNote?.trim()),
      followUp: patch.nextFollowUpOn !== undefined,
    },
  });

  return data ? toContact(data as Row) : null;
}

export async function deleteContact(id: string, adminId: string): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("crm_contacts").delete().eq("id", id).select("id");
  if (error) throw error;
  const deleted = Boolean(data?.length);
  if (deleted) {
    await writeAuditEvent({
      actorUserId: adminId,
      action: "crm_contact_deleted",
      targetType: "crm_contacts",
      targetId: id,
      outcome: "success",
    });
  }
  return deleted;
}

/**
 * Ein Kontakt, der sich selbst meldet — etwa über „Gespräch buchen“. Anders
 * als beim Import ist die Anfrage der Anlass: Wiedervorlage heute, und wer
 * früher „kein Interesse“ hatte oder nicht mehr kontaktiert werden wollte,
 * steht nach der eigenen Anfrage wieder auf „Neu“. Eine laufende Pipeline
 * (angeschrieben, Gespräch, Kunde) bleibt, wie sie ist; die Notiz des
 * Betreibers wird nicht überschrieben, die Anfrage kommt in den Verlauf.
 */
export async function recordInboundLead(
  contact: ContactInput,
  options: { source: string; today: string; eventBody: string },
): Promise<{ id: string; created: boolean }> {
  const admin = createAdminSupabaseClient();
  const key = contactDedupeKey(contact);
  const now = new Date().toISOString();

  const findExisting = async () => {
    const { data, error } = await admin.from("crm_contacts").select("id,stage").eq("dedupe_key", key).maybeSingle();
    if (error) throw error;
    return data as { id: string; stage: string } | null;
  };

  let existing = await findExisting();
  let created = false;
  let id = "";
  let fromStage: string | null = null;
  let toStage: string | null = null;

  if (!existing) {
    const { data, error } = await admin
      .from("crm_contacts")
      .insert({
        ...inputRow(contact),
        dedupe_key: key,
        source: options.source.slice(0, 80),
        stage: "new",
        next_follow_up_on: options.today,
        updated_at: now,
      })
      .select("id")
      .single();
    // Zwei gleichzeitige Anfragen derselben Person: die zweite wird zur
    // Aktualisierung der ersten.
    if (error && (error as { code?: string }).code !== "23505") throw error;
    if (data) {
      created = true;
      id = String((data as Row).id);
    } else {
      existing = await findExisting();
      if (!existing) throw error ?? new Error("crm contact missing after conflict");
    }
  }

  if (existing) {
    id = existing.id;
    const reopen = existing.stage === "not_interested" || existing.stage === "do_not_contact";
    const update: Row = {
      company: contact.company,
      contact_name: contact.contactName,
      kind: contact.kind,
      focus: contact.focus,
      email: contact.email,
      email_kind: contact.emailKind,
      next_follow_up_on: options.today,
      updated_at: now,
    };
    if (reopen) {
      update.stage = "new";
      fromStage = existing.stage;
      toStage = "new";
    }
    const { error } = await admin.from("crm_contacts").update(update).eq("id", id);
    if (error) throw error;
  }

  const events: Row[] = [{ contact_id: id, kind: "note", body: options.eventBody.slice(0, 2000) }];
  if (fromStage && toStage) events.push({ contact_id: id, kind: "stage", from_stage: fromStage, to_stage: toStage });
  const insert = await admin.from("crm_contact_events").insert(events);
  if (insert.error) throw insert.error;

  return { id, created };
}

/** Für die Übersicht: fällige Wiedervorlagen, neue Kontakte, offene Anfragen. */
export async function contactWorkload(
  today: string,
): Promise<{ due: number; fresh: number; total: number; inbound: number }> {
  const admin = createAdminSupabaseClient();
  const [due, fresh, total, inbound] = await Promise.all([
    admin
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .lte("next_follow_up_on", today)
      .in("stage", [...OPEN_CONTACT_STAGES]),
    admin.from("crm_contacts").select("id", { count: "exact", head: true }).eq("stage", "new").not("email", "is", null),
    admin.from("crm_contacts").select("id", { count: "exact", head: true }),
    admin.from("crm_contacts").select("id", { count: "exact", head: true }).eq("kind", SALES_CALL_KIND).eq("stage", "new"),
  ]);
  return { due: due.count ?? 0, fresh: fresh.count ?? 0, total: total.count ?? 0, inbound: inbound.count ?? 0 };
}
