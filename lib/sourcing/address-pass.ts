import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { isPaused, readSourcingAutomation } from "./automation";
import { resolveContactAddress } from "./resolve-address";

/**
 * Der Lauf, der zu recherchierten Kandidaten die Adresse sucht.
 *
 * Getrennt von der Übernahme, aus zwei Gründen. Er **kostet Geld** — ein
 * Websuchlauf je Person, rund fünf Cent —, deshalb hat er ein Tagesbudget.
 * Und er **dauert**: Suche, dann ein bis drei Seitenabrufe, zusammen zehn bis
 * zwanzig Sekunden je Person. In der Antwortzeit einer Kundenanfrage hat das
 * nichts zu suchen.
 *
 * Was er nicht findet, ist kein Fehlschlag, sondern ein Ergebnis: Der
 * Kandidat bleibt ohne Adresse und wird von Hand über LinkedIn oder das
 * Kontaktformular der Plattform angesprochen. Der Grund wird vermerkt, damit
 * niemand denselben Kandidaten morgen noch einmal bezahlt.
 */

const SPALTEN =
  "id,full_name,role_title,skills,location_text,source_profile_url,address_lookup_at";

export type AddressPassOutcome = {
  ran: boolean;
  reason?: "switch_off" | "paused" | "budget_spent" | "nothing_to_do";
  attempted: number;
  resolved: number;
  results: {
    applicationId: string;
    fullName: string;
    email: string | null;
    verdict: string;
    detail: string;
  }[];
};

/** Wie viele Auflösungen heute schon gelaufen sind. */
async function heuteVerbraucht(): Promise<number> {
  const admin = createAdminSupabaseClient();
  const seit = new Date();
  seit.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin
    .from("freelancer_applications")
    .select("id", { count: "exact", head: true })
    .eq("source", "web_research")
    .gte("address_lookup_at", seit.toISOString());
  if (error) return 0;
  return count ?? 0;
}

export async function runAddressPass(input: {
  limit?: number;
  /** Übergeht den Schalter — für den Knopf im Adminbereich. */
  force?: boolean;
  safetyIdentifier?: string;
} = {}): Promise<AddressPassOutcome> {
  const automation = await readSourcingAutomation();
  if (!input.force) {
    if (!automation.resolveAddresses) {
      return { ran: false, reason: "switch_off", attempted: 0, resolved: 0, results: [] };
    }
    if (isPaused(automation)) {
      return { ran: false, reason: "paused", attempted: 0, resolved: 0, results: [] };
    }
  }

  const verbraucht = await heuteVerbraucht();
  const uebrig = Math.max(automation.dailyAddressBudget - verbraucht, 0);
  const grenze = Math.min(input.limit ?? 5, input.force ? (input.limit ?? 5) : uebrig);
  if (grenze <= 0) {
    return { ran: false, reason: "budget_spent", attempted: 0, resolved: 0, results: [] };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .select(SPALTEN)
    .eq("source", "web_research")
    .eq("status", "sourced")
    .is("contact_email", null)
    .is("address_lookup_at", null)
    .order("created_at", { ascending: true })
    .limit(grenze);
  if (error) throw error;

  const offen = (data ?? []) as Record<string, unknown>[];
  if (offen.length === 0) {
    return { ran: true, reason: "nothing_to_do", attempted: 0, resolved: 0, results: [] };
  }

  const ergebnisse: AddressPassOutcome["results"] = [];
  let gefunden = 0;

  for (const zeile of offen) {
    const id = String(zeile.id);
    const name = String(zeile.full_name ?? "");
    const rolle = String(zeile.role_title ?? "Freelancer");
    const skills = (zeile.skills as string[] | null) ?? [];

    const ergebnis = await resolveContactAddress({
      displayName: name,
      role: rolle,
      skills: skills.slice(0, 6),
      location: (zeile.location_text as string | null) ?? null,
      safetyIdentifier: input.safetyIdentifier,
    });

    // Der Versuch wird in jedem Fall vermerkt. Ohne diesen Stempel liefe der
    // nächste Lauf über dieselben Menschen und bezahlte sie noch einmal.
    const patch: Record<string, unknown> = {
      address_lookup_at: new Date().toISOString(),
      address_lookup_result: ergebnis.resolved ? ergebnis.address.verdict : ergebnis.reason,
    };
    if (ergebnis.resolved) {
      patch.contact_email = ergebnis.address.email;
      gefunden += 1;
    }
    await admin.from("freelancer_applications").update(patch).eq("id", id);

    ergebnisse.push({
      applicationId: id,
      fullName: name,
      email: ergebnis.resolved ? ergebnis.address.email : null,
      verdict: ergebnis.resolved ? ergebnis.address.verdict : ergebnis.reason,
      detail: ergebnis.resolved
        ? ergebnis.address.reason
        : (ergebnis.considered[0]?.reason ?? "keine Adresse gefunden"),
    });
  }

  return {
    ran: true,
    attempted: offen.length,
    resolved: gefunden,
    results: ergebnisse,
  };
}
