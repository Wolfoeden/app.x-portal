import "server-only";

import { createOpenAiClient } from "./provider";

/**
 * Inhalts-Fingerabdrücke (Embeddings) für die Vorauswahl der Suche.
 *
 * Das Modell ist über OPENAI_EMBEDDING_MODEL wählbar, die Länge des Vektors
 * nicht: Die Spalte in der Datenbank hat genau EMBEDDING_DIMENSIONS Stellen,
 * und die Modelle der text-embedding-3-Reihe kürzen auf Wunsch darauf.
 */
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_TIMEOUT_MS = 10_000;
/** Höchstens so viele Texte je Anfrage an den Anbieter. */
const EMBEDDING_BATCH_SIZE = 96;

export function embeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

/** Kleine Schnittstelle, damit Tests ohne Anbieter auskommen. */
export interface EmbeddingClient {
  embed(texts: readonly string[], model: string): Promise<number[][]>;
}

export function createDefaultEmbeddingClient(
  apiKey: string | undefined = process.env.OPENAI_API_KEY?.trim(),
): EmbeddingClient | null {
  if (!apiKey) return null;
  const client = createOpenAiClient(apiKey);
  return {
    async embed(texts, model) {
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
        const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
        const response = await client.embeddings.create(
          { model, input: [...batch], dimensions: EMBEDDING_DIMENSIONS, encoding_format: "float" },
          { timeout: EMBEDDING_TIMEOUT_MS, maxRetries: 1 },
        );
        const ordered = [...response.data].sort((left, right) => left.index - right.index);
        if (ordered.length !== batch.length) {
          throw new Error("Embedding response does not match the request.");
        }
        for (const item of ordered) {
          if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
            throw new Error("Embedding has an unexpected dimension.");
          }
          vectors.push(item.embedding);
        }
      }
      return vectors;
    },
  };
}
