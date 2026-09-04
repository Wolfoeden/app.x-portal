import "server-only";

import { createHash } from "node:crypto";

import { logEvent } from "@/lib/security/request";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { emailDomain, maskEmail, normalizeEmail } from "./address";

/**
 * Die Sperrliste: wer keine werbliche Post mehr bekommt.
 *
 * Gespeichert wird nur der SHA-256 der normalisierten Adresse. Zum
 * Vergleichen genügt er, und eine Sperrliste im Klartext wäre ein zweiter
 * Adressbestand — zusammengetragen ausgerechnet aus den Leuten, die keinen
 * Kontakt wollten. Für die Ansicht im Admin bleibt eine maskierte Form.
 *
 * Kein HMAC, sondern ein reiner Hash: der Vergleich muss über einen
 * Schlüsselwechsel hinweg funktionieren. Der Adressraum ist zwar erratbar —
 * wer `info@firma.de` vermutet, kann den Hash nachrechnen —, aber das setzt
 * bereits voraus, dass jemand die Adresse kennt. Der Hash soll keinen
 * Bestand schützen, den es zu erraten gäbe; er soll verhindern, dass beim
 * Lesen der Tabelle eine Adressliste entsteht.
 */

export type SuppressionReason =
  | "unsubscribe_link"
  | "reply"
  | "bounce"
  | "complaint"
  | "operator";

export function hashEmail(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Das Ergebnis der Prüfung — und warum es drei Werte sind und nicht zwei.
 *
 * `unavailable` bedeutet: Es ließ sich nicht feststellen. Der Versand
 * unterbleibt in diesem Fall genauso wie bei `suppressed`, denn eine
 * übergangene Prüfung kostet eine Nachricht an jemanden, der ausdrücklich
 * widersprochen hat, und die ist nicht zurückzuholen.
 *
 * Verwechseln darf man beide trotzdem nicht. Ein früher Entwurf gab nur
 * „gesperrt" zurück, wenn die Abfrage scheiterte — mit der Folge, dass ein
 * Aussetzer der Datenbank in der Lead-Route als Widerspruch gelesen wurde und
 * den Lead dauerhaft verwarf. Eine Netzstörung hätte damit Leads gelöscht.
 */
export type SuppressionCheck = "clear" | "suppressed" | "unavailable";

export async function checkEmailSuppression(
  email: string,
): Promise<SuppressionCheck> {
  const normalized = normalizeEmail(email);
  // Eine unbrauchbare Adresse ist kein Widerspruch, aber auch kein
  // zustellbares Ziel. Der Aufrufer soll sie nicht als Absage verbuchen.
  if (!normalized) return "unavailable";

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("is_email_suppressed", {
      p_email_hash: hashEmail(normalized),
      p_domain: emailDomain(normalized),
    });
    if (error) throw error;
    return data === true ? "suppressed" : "clear";
  } catch {
    // Ohne Adresse und ohne Fehlertext im Log: die Tatsache genügt, um den
    // ausgelassenen Versand zu erklären.
    logEvent("email_suppression_check_failed", {});
    return "unavailable";
  }
}

/**
 * Die einfache Frage für Aufrufer, die zwischen „gesperrt" und „unbekannt"
 * nicht unterscheiden müssen — sie halten in beiden Fällen an.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  return (await checkEmailSuppression(email)) !== "clear";
}

export type SuppressionOutcome =
  | { suppressed: true; wasNew: boolean }
  | { suppressed: false; reason: "invalid_email" | "write_failed" };

/**
 * Trägt eine Adresse ein. Idempotent — derselbe Link zweimal geklickt ergibt
 * denselben einen Eintrag, und `wasNew` sagt, ob es der erste Klick war.
 */
export async function suppressEmail(input: {
  email: string;
  reason: SuppressionReason;
  source?: string | null;
}): Promise<SuppressionOutcome> {
  const normalized = normalizeEmail(input.email);
  if (!normalized) return { suppressed: false, reason: "invalid_email" };

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("suppress_email", {
      p_email_hash: hashEmail(normalized),
      p_masked: maskEmail(normalized),
      p_reason: input.reason,
      p_source: input.source ?? null,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.suppressed) return { suppressed: false, reason: "write_failed" };
    return { suppressed: true, wasNew: row.was_new === true };
  } catch {
    logEvent("email_suppression_write_failed", { reason: input.reason });
    return { suppressed: false, reason: "write_failed" };
  }
}

/**
 * Hebt eine Sperre auf, weil dieselbe Adresse später eine belegbare
 * Einwilligung erteilt hat — der bestätigte Double-Opt-in ist der einzige
 * Anlass, der das trägt.
 *
 * Der Eintrag wird nicht gelöscht, sondern als widerrufen markiert: wer
 * später fragt, warum wieder geschrieben wurde, bekommt beides zu sehen, den
 * Widerspruch und die Einwilligung danach.
 */
export async function revokeEmailSuppression(input: {
  email: string;
  reason: string;
}): Promise<boolean> {
  const normalized = normalizeEmail(input.email);
  if (!normalized) return false;

  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("revoke_email_suppression", {
      p_email_hash: hashEmail(normalized),
      p_reason: input.reason,
    });
    if (error) throw error;
    return data === true;
  } catch {
    logEvent("email_suppression_revoke_failed", {});
    return false;
  }
}
