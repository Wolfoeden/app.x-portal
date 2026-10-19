import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FreelancerProfile } from "@/lib/domain";
import type { EmbeddingClient } from "@/lib/openai/embeddings";
import { logEvent } from "@/lib/security/request";

import {
  lexicalPrefilter,
  profileEmbeddingHash,
  profileEmbeddingText,
  requestEmbeddingText,
} from "./profile-text";

/** So viele Profile bewertet die KI je Suche, und so viele sieht der Nutzer. */
export const PREFILTER_SIZE = 20;

export type PrefilterCandidate = {
  profile: FreelancerProfile;
  /** Inhaltliche Nähe (Kosinus, 0–1); null bei der Vorauswahl über Wörter. */
  similarity: number | null;
};

export type PrefilterResult = {
  method: "semantic" | "lexical";
  candidates: PrefilterCandidate[];
};

const ID_CHUNK = 150;
const UPSERT_CHUNK = 40;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}

/**
 * Sorgt dafür, dass jedes Profil im Pool einen aktuellen Fingerabdruck hat.
 *
 * Neue und geänderte Profile werden hier nachgerechnet, in einer Anfrage an
 * den Anbieter. Das ersetzt einen Hintergrundjob: Welcher Weg ein Profil auch
 * geändert hat, die nächste Suche bemerkt es am Hash.
 */
export async function ensureProfileEmbeddings(
  admin: SupabaseClient,
  profiles: readonly FreelancerProfile[],
  client: EmbeddingClient,
  model: string,
): Promise<number> {
  const stored = new Map<string, string>();
  const reads = await Promise.all(
    chunks(profiles.map((profile) => profile.id), ID_CHUNK).map((ids) =>
      admin
        .from("freelancer_profile_embeddings")
        .select("profile_id,input_hash")
        .eq("model", model)
        .in("profile_id", ids),
    ),
  );
  for (const { data, error } of reads) {
    if (error) throw error;
    for (const row of (data ?? []) as { profile_id: string; input_hash: string }[]) {
      stored.set(row.profile_id, row.input_hash);
    }
  }

  const stale = profiles
    .map((profile) => ({ profile, hash: profileEmbeddingHash(profile, model) }))
    .filter(({ profile, hash }) => stored.get(profile.id) !== hash);
  if (!stale.length) return 0;

  const vectors = await client.embed(
    stale.map(({ profile }) => profileEmbeddingText(profile)),
    model,
  );
  const rows = stale.map(({ profile, hash }, index) => ({
    profile_id: profile.id,
    input_hash: hash,
    model,
    embedding: vectors[index],
    created_at: new Date().toISOString(),
  }));
  for (const batch of chunks(rows, UPSERT_CHUNK)) {
    const { error } = await admin
      .from("freelancer_profile_embeddings")
      .upsert(batch, { onConflict: "profile_id" });
    if (error) throw error;
  }
  logEvent("profile_embeddings_refreshed", { count: stale.length, model });
  return stale.length;
}

/**
 * Stufe 1 der Suche: die Profile, die der Anfrage inhaltlich am nächsten
 * sind.
 *
 * Normalfall ist der Vergleich der Fingerabdrücke in der Datenbank. Ist der
 * Anbieter nicht erreichbar, grenzt die Suche über gemeinsame Fachwörter ein,
 * statt ohne Ergebnis zu enden.
 */
export async function prefilterProfiles(input: {
  admin: SupabaseClient;
  profiles: readonly FreelancerProfile[];
  request: string;
  client: EmbeddingClient | null;
  model: string;
  limit?: number;
}): Promise<PrefilterResult> {
  const limit = input.limit ?? PREFILTER_SIZE;
  const lexical = (): PrefilterResult => ({
    method: "lexical",
    candidates: lexicalPrefilter(input.request, input.profiles, limit).map(({ profile }) => ({
      profile,
      similarity: null,
    })),
  });
  if (!input.profiles.length) return { method: "semantic", candidates: [] };
  if (!input.client) return lexical();

  try {
    const [[queryVector]] = await Promise.all([
      input.client.embed([requestEmbeddingText(input.request)], input.model),
      ensureProfileEmbeddings(input.admin, input.profiles, input.client, input.model),
    ]);
    const { data, error } = await input.admin.rpc("match_freelancer_profile_embeddings", {
      query_embedding: queryVector,
      query_model: input.model,
      candidate_ids: input.profiles.map((profile) => profile.id),
      match_count: limit,
    });
    if (error) throw error;
    const byId = new Map(input.profiles.map((profile) => [profile.id, profile]));
    const candidates = ((data ?? []) as { profile_id: string; similarity: number }[]).flatMap((row) => {
      const profile = byId.get(row.profile_id);
      return profile ? [{ profile, similarity: Number(row.similarity) }] : [];
    });
    if (!candidates.length) return lexical();
    return { method: "semantic", candidates };
  } catch (error) {
    logEvent("profile_prefilter_fallback", {
      reason:
        error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? error.code
          : error instanceof Error
            ? error.name
            : "unknown",
    });
    return lexical();
  }
}
