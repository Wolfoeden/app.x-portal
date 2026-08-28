import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import {
  byUrgency,
  outreachDeadline,
  type OutreachDeadline,
} from "./outreach-deadline";

/**
 * Die recherchierten Kandidaten, für die die Frist aus Art. 14 DSGVO läuft.
 *
 * Bewusst ohne Kontaktdaten in der Liste: Die Übersicht soll zeigen, *wie
 * viele* Fristen laufen und *welche* knapp werden — dafür braucht sie Name,
 * Rolle und Zeitpunkte, nicht die E-Mail-Adresse. Wer die Ansprache schreibt,
 * öffnet den Einzelfall.
 */

const COLUMNS =
  "id,full_name,role_title,source_urls,sourced_at,outreach_sent_at,outreach_channel,consent_at,created_at";

export type SourcedCandidateRow = {
  id: string;
  full_name: string;
  role_title: string;
  source_urls: string[] | null;
  sourced_at: string | null;
  outreach_sent_at: string | null;
  outreach_channel: string | null;
  consent_at: string | null;
  created_at: string;
};

export type SourcedCandidate = SourcedCandidateRow & {
  deadline: OutreachDeadline;
};

export async function listSourcedCandidates(options?: {
  limit?: number;
  now?: Date;
}): Promise<SourcedCandidate[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .select(COLUMNS)
    .eq("source", "web_research")
    .eq("status", "sourced")
    .is("consent_at", null)
    .order("sourced_at", { ascending: true, nullsFirst: true })
    .limit(options?.limit ?? 200);
  if (error) throw error;

  const now = options?.now ?? new Date();
  return ((data ?? []) as SourcedCandidateRow[])
    .map((row) => ({
      ...row,
      deadline: outreachDeadline({
        sourcedAt: row.sourced_at,
        outreachSentAt: row.outreach_sent_at,
        now,
      }),
    }))
    // Verstrichene Fristen zuerst: Die Liste ist eine Arbeitsliste, keine
    // Chronik.
    .sort((left, right) => byUrgency(left.deadline, right.deadline));
}

export type OutreachSummary = {
  total: number;
  overdue: number;
  warning: number;
  open: number;
  informed: number;
};

export function summarizeOutreach(
  candidates: readonly SourcedCandidate[],
): OutreachSummary {
  const summary: OutreachSummary = {
    total: candidates.length,
    overdue: 0,
    warning: 0,
    open: 0,
    informed: 0,
  };
  for (const candidate of candidates) summary[candidate.deadline.state] += 1;
  return summary;
}

/**
 * Hält fest, dass eine Person informiert wurde.
 *
 * Der Versand selbst passiert außerhalb der Anwendung — XPORTAL hat keinen
 * E-Mail-Anbieter, und bei einer Erstansprache ist ein Mensch, der den Text
 * vorher liest, ohnehin die ehrlichere Variante. Was hier zählt, ist der
 * Nachweis: ohne Zeitpunkt keine belegbare Einhaltung der Frist.
 */
export async function markOutreachSent(input: {
  applicationId: string;
  channel: "email" | "linkedin" | "website" | "other";
  sentAt?: Date;
}): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .update({
      outreach_sent_at: (input.sentAt ?? new Date()).toISOString(),
      outreach_channel: input.channel,
    })
    .eq("id", input.applicationId)
    .eq("source", "web_research")
    .eq("status", "sourced")
    // Eine bereits vermerkte Information wird nicht überschrieben: der erste
    // Zeitpunkt ist der, auf den es ankommt.
    .is("outreach_sent_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
