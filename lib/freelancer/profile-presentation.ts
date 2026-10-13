import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingSchema } from "@/lib/data/freelancer-projects";
import {
  generateProfilePresentation,
  PRESENTATION_VERSION,
  type PresentationInput,
  type ProfilePresentation,
} from "@/lib/openai/profile-presentation";

/**
 * Die Aufbereitung der Profilseite aus dem Zwischenspeicher
 * (`freelancer_profile_presentations`, Migration 20261013090000).
 *
 * Die Seite wartet nie auf das Modell: Fehlt die Aufbereitung für den
 * aktuellen Inhaltsstand, zeigt sie die Rohdaten und stößt die Aufbereitung
 * nach der Antwort an (`refreshProfilePresentation` in `after()`). Der
 * nächste Aufruf sieht das Ergebnis.
 */

/** Nach einem Fehlversuch wird frühestens nach einem Tag neu gefragt. */
const RETRY_AFTER_MS = 24 * 60 * 60_000;

export function presentationInputHash(input: PresentationInput): string {
  const normalized = {
    version: PRESENTATION_VERSION,
    role: input.role.trim(),
    summary: input.summary?.trim() ?? null,
    skills: input.skills.map((value) => value.trim()),
    industries: input.industries.map((value) => value.trim()),
    qualifications: input.qualifications.map((value) => value.trim()),
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

type Row = {
  input_hash: string;
  presentation: ProfilePresentation | null;
  status: "ok" | "failed";
  created_at: string;
};

export type PresentationLookup = {
  /** Die Aufbereitung für genau diesen Inhaltsstand, sonst null. */
  presentation: ProfilePresentation | null;
  /** Ob sich eine neue Aufbereitung lohnt (fehlt, veraltet, Fehlversuch alt). */
  stale: boolean;
};

export async function loadProfilePresentation(
  admin: SupabaseClient,
  profileId: string,
  input: PresentationInput,
  now: Date = new Date(),
): Promise<PresentationLookup> {
  const hash = presentationInputHash(input);
  const { data, error } = await admin
    .from("freelancer_profile_presentations")
    .select("input_hash,presentation,status,created_at")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) {
    // Ohne Migration bleibt die Seite bei den Rohdaten und fragt nicht nach.
    if (isMissingSchema(error)) return { presentation: null, stale: false };
    throw error;
  }
  const row = data as Row | null;
  if (!row || row.input_hash !== hash) return { presentation: null, stale: true };
  if (row.status === "ok" && row.presentation) return { presentation: row.presentation, stale: false };
  const failedAt = Date.parse(row.created_at);
  return { presentation: null, stale: !Number.isFinite(failedAt) || now.getTime() - failedAt > RETRY_AFTER_MS };
}

/** Fragt das Modell und legt das Ergebnis (oder den Fehlversuch) ab. */
export async function refreshProfilePresentation(
  admin: SupabaseClient,
  profileId: string,
  input: PresentationInput,
  generate: typeof generateProfilePresentation = generateProfilePresentation,
): Promise<void> {
  const result = await generate(input);
  // Ohne Schlüssel kein Eintrag: Sonst stünde ein Fehlversuch für etwas da,
  // das nie versucht wurde.
  if (result.status === "unavailable") return;
  const { error } = await admin.from("freelancer_profile_presentations").upsert(
    {
      profile_id: profileId,
      input_hash: presentationInputHash(input),
      presentation: result.status === "ok" ? result.presentation : null,
      status: result.status === "ok" ? "ok" : "failed",
      model: result.status === "ok" ? result.model.slice(0, 120) : null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );
  if (error && !isMissingSchema(error)) throw error;
}
