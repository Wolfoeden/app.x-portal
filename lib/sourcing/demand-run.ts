import "server-only";

import type { DemandBrief } from "@/lib/freelancer/outreach";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { skillOverlap } from "./match";
import { resolveContactAddress } from "./resolve-address";
import { inviteSourcedCandidate, runSourcingPass } from "./run";

/**
 * Der ganze Vorgang hinter dem Knopf an einem Nachfrageprofil.
 *
 * Drei Stufen, in dieser Reihenfolge und mit dieser Trennung:
 *
 *   1. **Beschaffen** — kostenlos, legt Kandidaten an. Ab hier läuft für
 *      diese Menschen die Frist aus Art. 14 DSGVO.
 *   2. **Adresse suchen** — kostet je Person eine Websuche, rund fünf Cent.
 *   3. **Einladen** — erreicht Menschen und ist nicht rückholbar.
 *
 * Jede Stufe kann einzeln abgewählt werden, und keine reißt die anderen mit:
 * Wer keine Adresse hat, bleibt Kandidat und wird von Hand angesprochen; wer
 * nicht eingeladen wurde, bleibt für morgen übrig.
 */

export type DemandRunOutcome = {
  profileLabel: string;
  runId: string | null;
  alreadyRanToday: boolean;
  skippedSkills: string[];
  /** Gefundene Profile bei der Quelle, entdoppelt. */
  found: number;
  /** Davon mit bürgerlichem Namen und Skills. */
  addressable: number;
  /** Davon als Kandidat angelegt (Doppelte übersprungen). */
  imported: number;
  /**
   * Warum ein Gefundener nicht angelegt wurde.
   *
   * Ohne diese Zeile meldet der Knopf „2 gefunden, 0 angelegt" und niemand
   * erfährt, ob die Leute schon vorlagen, widersprochen haben oder ob die
   * Übernahme kaputt ist. Genau das ist beim ersten Probelauf passiert.
   */
  importSkipped: { reason: string; profileUrl: string; detail?: string }[];
  /** Kandidaten, zu denen eine benutzbare Adresse gefunden wurde. */
  addressed: number;
  /** Verschickte Einladungen. */
  invited: number;
  /** Was mit jedem Einzelnen geschah, für die Rückmeldung im Adminbereich. */
  people: {
    name: string;
    profileUrl: string;
    email: string | null;
    addressVerdict: string | null;
    invite: "sent" | "failed" | "suppressed" | "skipped" | null;
    note: string | null;
  }[];
};

type OffeneZeile = {
  id: string;
  full_name: string;
  role_title: string;
  skills: string[] | null;
  source_profile_url: string | null;
  contact_email: string | null;
  location_text: string | null;
};

const SPALTEN =
  "id,full_name,role_title,skills,source_profile_url,contact_email,location_text";

export async function runDemandSourcing(input: {
  demandProfileKey: string;
  demandProfileLabel: string;
  skills: readonly string[];
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  location: string | null;
  adminId: string;
  limitPerSkill?: number;
  resolveAddresses?: boolean;
  sendInvites?: boolean;
}): Promise<DemandRunOutcome> {
  // Stufe 1
  const lauf = await runSourcingPass({
    demandProfileKey: input.demandProfileKey,
    demandProfileLabel: input.demandProfileLabel,
    skills: input.skills,
    adminId: input.adminId,
    limitPerSkill: input.limitPerSkill,
  });

  const ergebnis: DemandRunOutcome = {
    profileLabel: input.demandProfileLabel,
    runId: lauf.runId,
    alreadyRanToday: lauf.alreadyRanToday,
    skippedSkills: lauf.skippedSkills,
    found: lauf.found,
    addressable: lauf.addressable,
    imported: lauf.import?.created ?? 0,
    // Unverändert weitergeben, `detail` eingeschlossen. Genau diese Angabe
    // hier wegzulassen hat den Grund für „0 angelegt" schon einmal verdeckt.
    importSkipped: [...(lauf.import?.skipped ?? [])],
    addressed: 0,
    invited: 0,
    people: [],
  };

  const profilAdressen = lauf.candidates.map((wert) => wert.profileUrl);
  if (profilAdressen.length === 0) return ergebnis;

  // Die eben angelegten Kandidaten wieder einlesen — mit ihren Kennungen, die
  // für den Versandbeleg gebraucht werden.
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("freelancer_applications")
    .select(SPALTEN)
    .eq("source", "web_research")
    .eq("status", "sourced")
    .is("consent_at", null)
    .in("source_profile_url", profilAdressen);
  if (error) throw error;

  const kandidaten = (data ?? []) as OffeneZeile[];

  for (const zeile of kandidaten) {
    const person: DemandRunOutcome["people"][number] = {
      name: zeile.full_name,
      profileUrl: zeile.source_profile_url ?? "",
      email: zeile.contact_email,
      addressVerdict: zeile.contact_email ? "vorhanden" : null,
      invite: null,
      note: null,
    };

    // Stufe 2
    if (!zeile.contact_email && input.resolveAddresses !== false) {
      const aufloesung = await resolveContactAddress({
        displayName: zeile.full_name,
        role: zeile.role_title,
        skills: (zeile.skills ?? []).slice(0, 6),
        location: zeile.location_text,
      });
      const patch: Record<string, unknown> = {
        address_lookup_at: new Date().toISOString(),
        address_lookup_result: aufloesung.resolved
          ? aufloesung.address.verdict
          : aufloesung.reason,
      };
      if (aufloesung.resolved) {
        patch.contact_email = aufloesung.address.email;
        person.email = aufloesung.address.email;
        person.addressVerdict = aufloesung.address.verdict;
        ergebnis.addressed += 1;
      } else {
        person.addressVerdict = aufloesung.reason;
        person.note = aufloesung.considered[0]?.reason ?? null;
      }
      await admin.from("freelancer_applications").update(patch).eq("id", zeile.id);
    } else if (zeile.contact_email) {
      ergebnis.addressed += 1;
    }

    // Stufe 3
    if (input.sendInvites && person.email) {
      const treffer = skillOverlap(input.skills, zeile.skills ?? []);
      const demand: DemandBrief = {
        headline: input.demandProfileLabel,
        workMode: input.workMode,
        location: input.location,
        matchingSkills: treffer.matching,
        otherSkills: treffer.other,
      };
      const versand = await inviteSourcedCandidate({
        candidate: {
          fullName: zeile.full_name,
          roleTitle: zeile.role_title,
          sourceUrls: zeile.source_profile_url ? [zeile.source_profile_url] : [],
        },
        contactEmail: person.email,
        demandProfileLabel: input.demandProfileLabel,
        demand,
        runId: lauf.runId,
        applicationId: zeile.id,
        profileUrl: zeile.source_profile_url,
      });
      person.invite = versand.status;
      if (versand.status === "sent") ergebnis.invited += 1;
      if (!versand.recorded) {
        person.note = `Versand ${versand.status}, aber ohne Beleg: ${versand.reason ?? ""}`;
      }
    } else if (input.sendInvites) {
      person.invite = "skipped";
      person.note = person.note ?? "keine benutzbare Adresse";
    }

    ergebnis.people.push(person);
  }

  return ergebnis;
}
