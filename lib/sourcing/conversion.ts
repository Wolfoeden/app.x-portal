import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { readInviteToken } from "./invite-token";

/**
 * Was aus einer Einladung wurde.
 *
 * Zwei Zeitpunkte, und die Reihenfolge ist die Aussage: `invite_opened_at`
 * sagt, dass die Nachricht ankam und jemand daraufklickte;
 * `converted_at` sagt, dass daraus ein Profil wurde. Zwischen beiden liegt,
 * was am Formular liegt, und vor dem ersten, was an der Nachricht liegt.
 * Ohne diese Trennung wüsste man bei null Anmeldungen nicht, ob der Text
 * schlecht ist oder das Formular.
 */

export type InviteCandidate = {
  id: string;
  fullName: string;
  roleTitle: string;
  /** Der Anlass, aus dem die Einladung entstand. Für die Begrüßung. */
  demandLabel: string | null;
  alreadyConverted: boolean;
};

/**
 * Löst ein Kennzeichen auf und vermerkt, dass die Einladung geöffnet wurde.
 *
 * Der Vermerk entsteht nur beim ersten Mal. Die Frage lautet „kam sie an?",
 * nicht „wie oft hat er nachgesehen?" — und die Zahl, wie oft jemand eine
 * Seite aufruft, brauchen wir über einen Menschen nicht.
 *
 * Ein unbekanntes oder abgelaufenes Kennzeichen ist kein Fehler: Der Kandidat
 * kann längst gelöscht sein. Dann öffnet sich das Formular wie für jeden
 * anderen auch.
 */
export async function openInvite(token: unknown): Promise<InviteCandidate | null> {
  const id = readInviteToken(token);
  if (!id) return null;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .select("id,full_name,role_title,sourcing_demand,invite_opened_at,converted_at")
    .eq("id", id)
    .eq("source", "web_research")
    .maybeSingle();
  if (error || !data) return null;

  const zeile = data as Record<string, unknown>;
  if (!zeile.invite_opened_at) {
    await admin
      .from("freelancer_applications")
      .update({ invite_opened_at: new Date().toISOString() })
      .eq("id", id)
      .is("invite_opened_at", null);
  }

  const demand = zeile.sourcing_demand as { headline?: unknown } | null;
  const headline =
    demand && typeof demand.headline === "string" ? demand.headline : null;

  return {
    id: String(zeile.id),
    fullName: String(zeile.full_name),
    roleTitle: String(zeile.role_title),
    demandLabel: headline,
    alreadyConverted: Boolean(zeile.converted_at),
  };
}

/**
 * Vermerkt, dass aus der Einladung eine Bewerbung wurde.
 *
 * Die Bewerbung bleibt eine eigene Zeile: Sie gehört einem angemeldeten Konto,
 * der Kandidat gehört keinem, und die beiden zusammenzuschieben hieße, die
 * Selbstauskunft der Person mit unserer Recherche zu vermischen. Verbunden
 * werden sie über `converted_application_id` — und damit fällt der Kandidat
 * zugleich aus der 30-Tage-Löschung heraus, weil er beantwortet ist.
 *
 * Wirft nicht. Ein fehlender Vermerk kostet eine Zahl in der Auswertung, nicht
 * die Bewerbung eines Menschen.
 */
export async function recordInviteConversion(input: {
  token: unknown;
  applicationId: string;
}): Promise<boolean> {
  const id = readInviteToken(input.token);
  if (!id) return false;

  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin
      .from("freelancer_applications")
      .update({
        converted_at: new Date().toISOString(),
        converted_application_id: input.applicationId,
      })
      .eq("id", id)
      .eq("source", "web_research")
      // Nur einmal. Wer sich zweimal einträgt, hat trotzdem einmal
      // konvertiert, und der erste Zeitpunkt ist der aussagekräftige.
      .is("converted_at", null);
    return !error;
  } catch {
    return false;
  }
}

export type ConversionStats = {
  /** Recherchierte Kandidaten insgesamt. */
  candidates: number;
  /** Davon angeschrieben. */
  invited: number;
  /** Davon haben den Link geöffnet. */
  opened: number;
  /** Davon haben sich eingetragen. */
  converted: number;
};

/** Die Bilanz der Beschaffung, für die Nachfrageseite. */
export async function readConversionStats(): Promise<ConversionStats> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .select("outreach_sent_at,invite_opened_at,converted_at")
    .eq("source", "web_research")
    .limit(2_000);
  if (error) throw error;

  const zeilen = (data ?? []) as Record<string, unknown>[];
  return {
    candidates: zeilen.length,
    invited: zeilen.filter((zeile) => zeile.outreach_sent_at).length,
    opened: zeilen.filter((zeile) => zeile.invite_opened_at).length,
    converted: zeilen.filter((zeile) => zeile.converted_at).length,
  };
}
