import "server-only";

import type { DemandBrief } from "@/lib/freelancer/outreach";
import { importSourcedCandidates } from "@/lib/freelancer/sourced-candidate-import";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { candidateFromProfile } from "./candidate";
import {
  isAddressable,
  sourceFromFreelancermap,
  type FreelancermapProfile,
} from "./freelancermap";
import { skillOverlap } from "./match";
import { resolveAddressesBatch } from "./resolve-batch";
import { inviteSourcedCandidate } from "./run";

/**
 * Der Beschaffungslauf in Schritten.
 *
 * Der erste Anlauf war ein einziger langer Aufruf: Verzeichnis laden, alle
 * Skills abklappern, alle Adressen suchen, alle einladen — zusammen fünfundvierzig
 * bis fünfundachtzig Sekunden. Die Plattform beendet eine synchrone Funktion
 * lange vorher, und weil der Fehlerzweig nichts protokollierte, sah das
 * genauso aus, als hätte niemand den Knopf gedrückt.
 *
 * Das Repo hatte die Antwort längst. `runLeadPreparePass()` arbeitet mit einem
 * Zeitbudget, meldet, was liegen blieb, und die Schleife läuft im Browser. In
 * `PrepareAllButton.tsx` steht der Grund seit Monaten: *„Eine Funktion, die
 * alles in einem Zug versucht, läuft in die Zeitgrenze des Gateways, und ein
 * Abbruch nach der Hälfte ließe niemanden wissen, welche Hälfte."*
 *
 * Hier ist dasselbe Muster, nur mit drei Phasen. Der Zustand liegt im Browser
 * und wird mitgeschickt — dann braucht es keine Tabelle, um zwischen zwei
 * Aufrufen etwas zu merken, und ein abgebrochener Lauf hinterlässt keine
 * halbfertige Zeile.
 */

/** Ein Schritt arbeitet höchstens so lange. Darunter bleibt Luft zur Grenze. */
export const STEP_BUDGET_MS = 12_000;

/**
 * Was ein Skill-Durchgang gemessen kostet: Pfad aufloesen, Liste holen, vier
 * Profile mit 1,2 s Pause dazwischen. Zwei Messungen: 7,8 und 7,8 Sekunden.
 */
const SKILL_KOSTEN_MS = 9_000;

/**
 * Wie viele Kandidaten ein Adressschritt nimmt.
 *
 * Der kostenlose Vorlauf braucht gemessen 0,3 bis 0,7 Sekunden je Person; die
 * bezahlte Suche danach hoechstens 15. Vier passen damit sicher in einen
 * Schritt, sechs waeren auf Kante genaeht.
 */
const ADRESS_STAPEL = 4;

export type StepPhase = "source" | "address" | "invite" | "done";

export type StepCursor = {
  phase: StepPhase;
  /** Phase `source`: welche Skills noch offen sind. */
  pendingSkills: string[];
  /** Phase `source`: Skills, zu denen es bei der Quelle keine Liste gibt. */
  skippedSkills: string[];
  /** Phase `address` und `invite`: welche Kandidaten noch offen sind. */
  pendingIds: string[];
  found: number;
  addressable: number;
  imported: number;
  addressed: number;
  invited: number;
  searchCalls: number;
  freeAddressHits: number;
};

export type StepPerson = {
  name: string;
  email: string | null;
  addressVerdict: string | null;
  invite: "sent" | "failed" | "suppressed" | "skipped" | null;
  note: string | null;
};

export type StepResult = {
  cursor: StepCursor;
  /** Falsch, solange noch etwas zu tun ist. */
  done: boolean;
  /** Was dieser Schritt getan hat — für die Anzeige im Browser. */
  didThisStep: string;
  people: StepPerson[];
  importSkipped: { reason: string; profileUrl: string; detail?: string }[];
};

export type StepInput = {
  demandProfileKey: string;
  demandProfileLabel: string;
  skills: readonly string[];
  workMode: "remote" | "on_site" | "hybrid" | "unknown";
  location: string | null;
  searches?: number;
  uniqueSeekers?: number;
  adminId: string;
  limitPerSkill?: number;
  resolveAddresses: boolean;
  sendInvites: boolean;
  cursor?: StepCursor | null;
  timeBudgetMs?: number;
};

const SPALTEN =
  "id,full_name,role_title,skills,source_profile_url,contact_email,location_text";

type OffeneZeile = {
  id: string;
  full_name: string;
  role_title: string;
  skills: string[] | null;
  source_profile_url: string | null;
  contact_email: string | null;
  location_text: string | null;
};

/** Der Anfangszustand, wenn der Browser noch keinen mitschickt. */
export function initialCursor(skills: readonly string[]): StepCursor {
  return {
    phase: "source",
    pendingSkills: [...skills],
    skippedSkills: [],
    pendingIds: [],
    found: 0,
    addressable: 0,
    imported: 0,
    addressed: 0,
    invited: 0,
    searchCalls: 0,
    freeAddressHits: 0,
  };
}

export async function runDemandStep(input: StepInput): Promise<StepResult> {
  const budget = Math.max(input.timeBudgetMs ?? STEP_BUDGET_MS, 2_000);
  const start = Date.now();
  const cursor: StepCursor = input.cursor
    ? { ...input.cursor }
    : initialCursor(input.skills);
  const people: StepPerson[] = [];
  const importSkipped: StepResult["importSkipped"] = [];
  const admin = createAdminSupabaseClient();
  let getan = "";

  // ---- Phase 1: beschaffen, ein Skill je Durchgang --------------------------
  if (cursor.phase === "source") {
    const profile = new Map<string, FreelancermapProfile>();

    // Nur anfangen, was auch fertig wird.
    //
    // `Date.now() - start < budget` allein wäre falsch: Ein Skill, der bei
    // 11,9 Sekunden startet, läuft bis 20 — und genau daran ist der erste
    // Anlauf gescheitert. Gemessen dauert ein Skill-Durchgang 7,8 Sekunden;
    // mit diesem Puffer beginnt in einem Schritt höchstens einer, und ein
    // zweiter nur, wenn der erste ungewöhnlich schnell war.
    while (
      cursor.pendingSkills.length > 0 &&
      Date.now() - start + SKILL_KOSTEN_MS < budget
    ) {
      const skill = cursor.pendingSkills.shift()!;
      const lauf = await sourceFromFreelancermap({
        skill,
        limit: input.limitPerSkill ?? 4,
        // Bewusst ohne Verzeichnis: Es kostet einundfünfzig Abrufe und die
        // Probeabrufe je Skill sind billiger.
      });
      if (!lauf.skillPageFound) {
        cursor.skippedSkills.push(skill);
        continue;
      }
      for (const p of lauf.profiles) {
        if (!profile.has(p.profileUrl)) profile.set(p.profileUrl, p);
      }
    }

    const ansprechbar = [...profile.values()].filter(isAddressable);
    cursor.found += profile.size;
    cursor.addressable += ansprechbar.length;

    const kandidaten = ansprechbar
      .map(candidateFromProfile)
      .filter((wert): wert is NonNullable<typeof wert> => wert !== null);

    if (kandidaten.length > 0) {
      const eingelesen = await importSourcedCandidates({
        candidates: kandidaten,
        adminId: input.adminId,
      });
      cursor.imported += eingelesen.created;
      importSkipped.push(...eingelesen.skipped);

      // Die eben angelegten Zeilen einsammeln — ihre Kennungen trägt der
      // Zustand in die nächsten Phasen.
      const { data } = await admin
        .from("freelancer_applications")
        .select("id")
        .eq("source", "web_research")
        .eq("status", "sourced")
        .is("consent_at", null)
        .in(
          "source_profile_url",
          kandidaten.map((wert) => wert.profileUrl),
        );
      for (const zeile of (data ?? []) as { id: string }[]) {
        if (!cursor.pendingIds.includes(zeile.id)) cursor.pendingIds.push(zeile.id);
      }
    }

    getan = `${profile.size} Profile gesehen, ${cursor.imported} angelegt`;

    if (cursor.pendingSkills.length === 0) {
      cursor.phase = input.resolveAddresses
        ? "address"
        : input.sendInvites
          ? "invite"
          : "done";
    }
    return {
      cursor,
      done: cursor.phase === "done",
      didThisStep: getan,
      people,
      importSkipped,
    };
  }

  // ---- Phase 2: Adressen, ein Bündel je Durchgang ---------------------------
  if (cursor.phase === "address") {
    const stapel = cursor.pendingIds.slice(0, ADRESS_STAPEL);
    if (stapel.length === 0) {
      cursor.phase = input.sendInvites ? "invite" : "done";
      return {
        cursor,
        done: cursor.phase === "done",
        didThisStep: "keine Kandidaten für Adressen",
        people,
        importSkipped,
      };
    }

    const { data } = await admin
      .from("freelancer_applications")
      .select(SPALTEN)
      .in("id", stapel);
    const zeilen = (data ?? []) as OffeneZeile[];
    const offen = zeilen.filter((zeile) => !zeile.contact_email);

    if (offen.length > 0) {
      const lauf = await resolveAddressesBatch({
        people: offen.map((zeile) => ({
          ref: zeile.id,
          displayName: zeile.full_name,
          role: zeile.role_title,
          skills: (zeile.skills ?? []).slice(0, 6),
          location: zeile.location_text,
        })),
      });
      cursor.searchCalls += lauf.searchCalls;
      cursor.freeAddressHits += lauf.freeHits;

      for (const treffer of lauf.results) {
        const patch: Record<string, unknown> = {
          address_lookup_at: new Date().toISOString(),
          address_lookup_result: treffer.address
            ? treffer.address.verdict
            : (treffer.reason ?? "no_usable_address"),
        };
        if (treffer.address) {
          patch.contact_email = treffer.address.email;
          cursor.addressed += 1;
        }
        await admin
          .from("freelancer_applications")
          .update(patch)
          .eq("id", treffer.ref);

        people.push({
          name: treffer.displayName,
          email: treffer.address?.email ?? null,
          addressVerdict: treffer.address?.verdict ?? treffer.reason,
          invite: null,
          note: treffer.via === "derived_domain" ? "ohne Websuche" : null,
        });
      }
    }

    for (const zeile of zeilen.filter((wert) => wert.contact_email)) {
      cursor.addressed += 1;
      people.push({
        name: zeile.full_name,
        email: zeile.contact_email,
        addressVerdict: "vorhanden",
        invite: null,
        note: null,
      });
    }

    cursor.pendingIds = cursor.pendingIds.filter((id) => !stapel.includes(id));
    getan = `${stapel.length} Adressen geprüft`;

    if (cursor.pendingIds.length === 0) {
      if (input.sendInvites) {
        // Für den Versand von vorn: dieselben Kandidaten, jetzt mit Adresse.
        const { data: fertig } = await admin
          .from("freelancer_applications")
          .select("id")
          .eq("source", "web_research")
          .eq("status", "sourced")
          .is("consent_at", null)
          .is("outreach_sent_at", null)
          .not("contact_email", "is", null);
        cursor.pendingIds = ((fertig ?? []) as { id: string }[]).map(
          (zeile) => zeile.id,
        );
        cursor.phase = "invite";
      } else {
        cursor.phase = "done";
      }
    }
    return {
      cursor,
      done: cursor.phase === "done",
      didThisStep: getan,
      people,
      importSkipped,
    };
  }

  // ---- Phase 3: einladen, wenige je Durchgang -------------------------------
  if (cursor.phase === "invite") {
    const stapel = cursor.pendingIds.slice(0, 3);
    if (stapel.length === 0) {
      cursor.phase = "done";
      return {
        cursor,
        done: true,
        didThisStep: "niemand mehr einzuladen",
        people,
        importSkipped,
      };
    }

    const { data } = await admin
      .from("freelancer_applications")
      .select(SPALTEN)
      .in("id", stapel);

    for (const zeile of (data ?? []) as OffeneZeile[]) {
      if (!zeile.contact_email) continue;
      const treffer = skillOverlap(input.skills, zeile.skills ?? []);
      const demand: DemandBrief = {
        headline: input.demandProfileLabel,
        workMode: input.workMode,
        location: input.location,
        matchingSkills: treffer.matching,
        otherSkills: treffer.other,
        searches: input.searches,
        uniqueSeekers: input.uniqueSeekers,
      };
      const versand = await inviteSourcedCandidate({
        candidate: {
          fullName: zeile.full_name,
          roleTitle: zeile.role_title,
          sourceUrls: zeile.source_profile_url ? [zeile.source_profile_url] : [],
        },
        contactEmail: zeile.contact_email,
        demandProfileLabel: input.demandProfileLabel,
        demand,
        applicationId: zeile.id,
        profileUrl: zeile.source_profile_url,
      });
      if (versand.status === "sent") cursor.invited += 1;
      people.push({
        name: zeile.full_name,
        email: zeile.contact_email,
        addressVerdict: null,
        invite: versand.status,
        note: versand.recorded ? null : `ohne Beleg: ${versand.reason ?? ""}`,
      });
    }

    cursor.pendingIds = cursor.pendingIds.filter((id) => !stapel.includes(id));
    getan = `${stapel.length} eingeladen`;
    if (cursor.pendingIds.length === 0) cursor.phase = "done";

    return {
      cursor,
      done: cursor.phase === "done",
      didThisStep: getan,
      people,
      importSkipped,
    };
  }

  return {
    cursor: { ...cursor, phase: "done" },
    done: true,
    didThisStep: "nichts zu tun",
    people,
    importSkipped,
  };
}
