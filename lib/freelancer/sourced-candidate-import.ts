import "server-only";

import { z } from "zod";

import { checkEmailSuppression } from "@/lib/email/suppression";
import {
  StoredExternalCandidateSchema,
  type ExternalFreelancerCandidate,
} from "@/lib/openai/external-freelancer-search";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Der Weg vom bezahlten Suchlauf in die Kandidatenliste.
 *
 * Bis hierher endete eine Recherche in drei Karten für den Auftraggeber, und
 * die gefundenen Menschen blieben im `result_snapshot` liegen. Wer sie
 * ansprechen wollte — und nach Art. 14 DSGVO *muss* man das —, hätte sie von
 * Hand abtippen müssen. Diese Übernahme schließt genau diese Lücke.
 *
 * Sie erzeugt nichts, was nicht in der Suche belegt war. Kein geratener Skill,
 * keine geratene Sprache, keine zusammengesetzte E-Mail-Adresse: Was fehlt,
 * bleibt leer, und die Person ergänzt es selbst, wenn sie zustimmt. Deshalb
 * hat `20260905120000_sourced_candidate_import.sql` die Pflichtfelder für
 * diese Quelle gelockert, statt hier Platzhalter einzusetzen.
 *
 * Der Zustand ist `sourced` und die Einwilligung leer — beides zusammen macht
 * eine Freigabe auf Datenbankebene unmöglich und startet die 30-Tage-Frist,
 * nach der ein unbeantworteter Kandidat restlos gelöscht wird.
 */

/** Untergrenze der Spalte `experience_summary`. */
const SUMMARY_MIN_LENGTH = 40;
const SUMMARY_MAX_LENGTH = 2_000;
const SKILL_MAX_LENGTH = 80;
const MAX_SKILLS = 80;
const MAX_DETAIL_ENTRIES = 20;

export type ImportSkipReason =
  /** Dieselbe Profiladresse liegt bereits als Kandidat oder Bewerbung vor. */
  | "duplicate"
  /** Die Adresse hat der Werbung widersprochen. */
  | "suppressed"
  /** Aus den Belegen ließ sich kein Text von brauchbarer Länge bilden. */
  | "summary_too_short"
  /** Die Zeile wurde von der Datenbank abgewiesen. */
  | "rejected";

export type ImportOutcome = {
  created: number;
  skipped: { reason: ImportSkipReason; profileUrl: string }[];
};

/**
 * Der Beschreibungstext eines Kandidaten.
 *
 * Die Zusammenfassung der Suche darf kurz sein, die Spalte verlangt 40
 * Zeichen. Aufgefüllt wird deshalb mit weiteren belegten Angaben derselben
 * Person — Tätigkeiten, dann Projekte. Reicht auch das nicht, wird der
 * Kandidat übersprungen. Text zu erfinden, nur damit eine Prüfung durchgeht,
 * wäre die schlechteste aller Lösungen: Er stünde später in der Ansprache.
 */
export function researchSummary(candidate: {
  summary: string;
  activities: readonly string[];
  projects: readonly string[];
}): string | null {
  const parts = [
    candidate.summary.trim(),
    ...candidate.activities.map((value) => value.trim()),
    ...candidate.projects.map((value) => value.trim()),
  ].filter(Boolean);

  const text = parts.join(" · ").slice(0, SUMMARY_MAX_LENGTH).trim();
  return text.length >= SUMMARY_MIN_LENGTH ? text : null;
}

/**
 * Die Skills eines recherchierten Kandidaten.
 *
 * Bevorzugt das, was die Quellen als Kompetenz nennen. Fehlt das, treten die
 * erfüllten Anforderungen an ihre Stelle — sie stammen aus dem Abgleich mit
 * der Ausschreibung und sind damit ebenfalls belegt, nur gröber. Ein leeres
 * Feld ist erlaubt und der ehrlichere Zustand.
 */
export function researchSkills(candidate: {
  skills: readonly string[];
  matchedRequirements: readonly string[];
}): string[] {
  const source = candidate.skills.length
    ? candidate.skills
    : candidate.matchedRequirements;
  return [
    ...new Set(
      source
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= SKILL_MAX_LENGTH),
    ),
  ].slice(0, MAX_SKILLS);
}

type ApplicationInsert = Record<string, unknown>;

export function sourcedCandidateInsert(input: {
  candidate: ExternalFreelancerCandidate;
  adminId: string;
  sourcedAt: string;
}): ApplicationInsert | null {
  const { candidate } = input;
  const summary = researchSummary(candidate);
  if (!summary) return null;

  return {
    status: "sourced",
    source: "web_research",
    // Kein Konto: Diese Person hat nichts eingereicht. `sourced_by_user_id`
    // hält fest, wer die Recherche veranlasst hat.
    submitted_by_user_id: null,
    sourced_by_user_id: input.adminId,
    sourced_at: input.sourcedAt,
    source_profile_url: candidate.profileUrl,
    source_urls: candidate.sourceUrls.slice(0, 12),
    full_name: candidate.displayName.trim().slice(0, 120),
    role_title: candidate.role.trim().slice(0, 160),
    experience_summary: summary,
    contact_email: candidate.contactEmail,
    website_url: candidate.websiteUrl,
    linkedin_url: candidate.linkedinUrl,
    portfolio_url: candidate.portfolioUrl,
    booking_url: candidate.bookingUrl,
    skills: researchSkills(candidate),
    // Nicht geraten. Sprache, Standort, Sätze und Verfügbarkeit ergänzt die
    // Person selbst, sobald sie zustimmt.
    languages: [],
    qualifications: [],
    industries: [],
    activities: candidate.activities.slice(0, MAX_DETAIL_ENTRIES),
    projects: candidate.projects.slice(0, MAX_DETAIL_ENTRIES),
    availability_status: "unknown",
    consent_at: null,
  };
}

/**
 * Übernimmt die Kandidaten eines Suchlaufs.
 *
 * Zeile für Zeile statt in einem Rutsch: Ein Kandidat, den die Datenbank
 * abweist, darf die übrigen nicht mitreißen. Bei drei Kandidaten je Lauf ist
 * das kein Kostenfaktor, und der Aufrufer erfährt für jeden einzelnen, warum
 * er nicht angelegt wurde.
 */
export async function importSourcedCandidates(input: {
  candidates: readonly ExternalFreelancerCandidate[];
  adminId: string;
  now?: Date;
}): Promise<ImportOutcome> {
  const admin = createAdminSupabaseClient();
  const sourcedAt = (input.now ?? new Date()).toISOString();
  const outcome: ImportOutcome = { created: 0, skipped: [] };

  for (const candidate of input.candidates) {
    // Wer der Werbung widersprochen hat, wird nicht erneut erfasst. Die
    // Sperrliste hielte die Nachricht ohnehin auf; die Zeile gar nicht erst
    // anzulegen erspart es, die Daten eines Menschen zu speichern, der genau
    // das nicht wollte.
    //
    // Nur bei einem echten Widerspruch. Ist die Liste gerade nicht erreichbar,
    // wird der Kandidat trotzdem angelegt — der Versand prüft später erneut,
    // und dort hält die Sperre. Ihn hier wegen eines Aussetzers zu verwerfen
    // hieße, einen bezahlten Treffer stillschweigend zu verlieren.
    if (
      candidate.contactEmail &&
      (await checkEmailSuppression(candidate.contactEmail)) === "suppressed"
    ) {
      outcome.skipped.push({
        reason: "suppressed",
        profileUrl: candidate.profileUrl,
      });
      continue;
    }

    const row = sourcedCandidateInsert({
      candidate,
      adminId: input.adminId,
      sourcedAt,
    });
    if (!row) {
      outcome.skipped.push({
        reason: "summary_too_short",
        profileUrl: candidate.profileUrl,
      });
      continue;
    }

    const { data, error } = await admin
      .from("freelancer_applications")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error) {
      // 23505 ist die Verletzung des eindeutigen Index auf der Profiladresse:
      // die Person liegt bereits vor. Das ist kein Fehler, sondern der Zweck
      // des Index.
      outcome.skipped.push({
        reason: error.code === "23505" ? "duplicate" : "rejected",
        profileUrl: candidate.profileUrl,
      });
      continue;
    }
    if (data) outcome.created += 1;
  }

  return outcome;
}

/* ------------------------------------------------------------------ */
/* Die Suchläufe, aus denen übernommen werden kann                      */
/* ------------------------------------------------------------------ */

const SearchRunRowSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().min(1),
  result_count: z.number().int().min(0).max(3),
  result_snapshot: z.array(StoredExternalCandidateSchema).max(3),
});

export type SearchRun = {
  id: string;
  createdAt: string;
  /**
   * Nur Name und Rolle je Treffer. Die Übersicht soll zeigen, was zu holen
   * ist — Adressen und Belege gehören in den Einzelfall, nicht in eine Liste,
   * die beim Öffnen der Seite entsteht.
   */
  candidates: { displayName: string; role: string; hasEmail: boolean }[];
  /** Wie viele davon bereits als Kandidat vorliegen. */
  alreadyImported: number;
};

/**
 * Die jüngsten bezahlten Suchläufe, quer über alle Konten.
 *
 * Bewusst ohne Bezug zum Auftraggeber: Für die Informationspflicht zählt die
 * gefundene Person, nicht wer die Suche bezahlt hat. Wer das wissen muss,
 * findet es im Protokoll.
 */
export async function listSearchRuns(limit = 25): Promise<SearchRun[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("external_freelancer_search_results")
    .select("id,created_at,result_count,result_snapshot")
    .gt("result_count", 0)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;

  const parsedRuns: { run: SearchRun; profileUrls: string[] }[] = [];
  const allProfileUrls = new Set<string>();

  for (const row of data ?? []) {
    const parsed = SearchRunRowSchema.safeParse(row);
    // Ein Schnappschuss, den das Schema nicht mehr liest, wird übersprungen,
    // statt die ganze Liste scheitern zu lassen.
    if (!parsed.success) continue;

    const profileUrls = parsed.data.result_snapshot.map(
      (candidate) => candidate.profileUrl,
    );
    for (const url of profileUrls) allProfileUrls.add(url);

    parsedRuns.push({
      profileUrls,
      run: {
        id: parsed.data.id,
        createdAt: parsed.data.created_at,
        candidates: parsed.data.result_snapshot.map((candidate) => ({
          displayName: candidate.displayName,
          role: candidate.role,
          hasEmail: Boolean(candidate.contactEmail),
        })),
        alreadyImported: 0,
      },
    });
  }

  if (allProfileUrls.size === 0) return parsedRuns.map((entry) => entry.run);

  // Eine Abfrage für alle Läufe zusammen: Bei 25 Läufen wären es sonst 25.
  const { data: known, error: knownError } = await admin
    .from("freelancer_applications")
    .select("source_profile_url")
    .in("source_profile_url", [...allProfileUrls]);
  if (knownError) throw knownError;

  const imported = new Set(
    (known ?? [])
      .map(
        (row) => (row as { source_profile_url: string | null }).source_profile_url,
      )
      .filter((url): url is string => Boolean(url)),
  );

  return parsedRuns.map(({ run, profileUrls }) => ({
    ...run,
    alreadyImported: profileUrls.filter((url) => imported.has(url)).length,
  }));
}

/** Die Kandidaten eines Laufs, vollständig — mit Kontaktadresse. */
export async function loadSearchRunCandidates(
  searchRunId: string,
): Promise<ExternalFreelancerCandidate[] | null> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("external_freelancer_search_results")
    .select("id,created_at,result_count,result_snapshot")
    .eq("id", searchRunId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const parsed = SearchRunRowSchema.safeParse(data);
  return parsed.success ? parsed.data.result_snapshot : null;
}
