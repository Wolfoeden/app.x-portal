import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { z } from "zod";

import {
  DEFAULT_OPENAI_BRIEF_MODEL,
  type BriefRequestOptions,
  type BriefResponsesClient,
} from "./brief";
import { createOpenAiClient } from "./provider";

/**
 * Die Aufbereitung der öffentlichen Profilseite: ein Satz, was jemand macht,
 * die Zusammenfassung auf Deutsch und die Kompetenzen in Schwerpunkten.
 *
 * Wie beim Lebenslauf-Entwurf ordnet das Modell nur, was im Profil steht. Die
 * Schwerpunkte dürfen ausschließlich Kompetenzen aus der übergebenen Liste
 * enthalten; was nicht darin steht, fällt beim Prüfen heraus
 * (`presentationFromOutput`).
 */

export type PresentationInput = {
  role: string;
  summary: string | null;
  skills: string[];
  industries: string[];
  qualifications: string[];
};

export type FocusArea = { title: string; skills: string[] };

export type ProfilePresentation = {
  /** Ein Satz zur Kernaussage, oder null, wenn die Angaben keinen hergeben. */
  headline: string | null;
  /** Die Zusammenfassung auf Deutsch; null, wenn sie schon deutsch ist. */
  summaryDe: string | null;
  focusAreas: FocusArea[];
  /** Branchen ohne Dopplungen (Deutsch/Englisch), auf Deutsch. */
  industries: string[];
  /** Der höchste Abschluss kurz, z. B. „M.Sc., TU Ilmenau“. */
  educationShort: string | null;
};

const OutputSchema = z.object({
  headline: z.string().nullable(),
  summaryDe: z.string().nullable(),
  focusAreas: z.array(z.object({ title: z.string(), skills: z.array(z.string()) })),
  industries: z.array(z.string()),
  educationShort: z.string().nullable(),
});

export type PresentationOutput = z.infer<typeof OutputSchema>;

export const PRESENTATION_INSTRUCTIONS = [
  "Du bereitest das öffentliche Profil eines Freelancers für Recruiter auf. Ein Recruiter soll in einer Sekunde sehen, was die Person kann.",
  "Verwende nur, was in den Angaben steht. Erfinde nichts, ergänze nichts aus Allgemeinwissen, keine Wertungen wie „erfahren“, „Experte“ oder „hervorragend“, wenn sie nicht wörtlich dort stehen.",
  "Alle Texte, die du schreibst, sind auf Deutsch. Fachbegriffe und Produktnamen (SAP FI/CO, S/4HANA, React) bleiben im Original.",
  "headline: eine kurze Wortgruppe auf Deutsch, höchstens 140 Zeichen, ohne Namen, ohne Ich-Form und ohne Verb im Infinitiv am Ende: was die Person in Projekten übernimmt. Beispiel: „SAP-FI/CO- und S/4HANA-Projekte von der Anforderung bis zum Rollout.“ Geben die Angaben keine solche Aussage her, null.",
  "summaryDe: Ist die Zusammenfassung nicht auf Deutsch, übersetze sie vollständig und sinngemäß ins Deutsche, ohne Kürzungen und ohne Zusätze. Gib niemals den englischen Text zurück. Ist sie schon deutsch oder fehlt sie, null.",
  "focusAreas: zwei bis vier Schwerpunkte mit kurzem deutschem Titel (höchstens vier Wörter). Jeder Schwerpunkt enthält drei bis sechs Kompetenzen, wörtlich aus der Liste „Kompetenzen“ kopiert. Steht eine Kompetenz in zwei Sprachen in der Liste (z. B. „Projektmanagement“ und „Project Management“), nimm nur eine davon, die deutsche. Die wichtigsten Kompetenzen zuerst; nicht jede Kompetenz muss vorkommen.",
  "industries: die Branchen auf Deutsch, jede nur einmal, höchstens fünf. „Finance & Accounting“ und „Finanzen & Rechnungswesen“ sind dieselbe Branche: nur „Finanzen & Rechnungswesen“.",
  "educationShort: der höchste Abschluss kurz mit Hochschule, z. B. „M.Sc., TU Ilmenau“, höchstens 40 Zeichen; fehlt einer, null.",
].join("\n");

/**
 * Teil des Fingerabdrucks im Zwischenspeicher: Ändern sich Anweisung oder
 * Prüfung, entsteht jede Aufbereitung beim nächsten Aufruf neu.
 */
export const PRESENTATION_VERSION = 2;

export const PRESENTATION_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 1_500;
const MAX_FOCUS_AREAS = 4;
const MAX_SKILLS_PER_AREA = 6;

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.replace(/\s+/gu, " ").trim() ?? "";
  if (!trimmed) return null;
  return trimmed.length > max ? null : trimmed;
}

/**
 * Prüft die Antwort gegen die Angaben: Schwerpunkte nur mit Kompetenzen aus
 * der Liste (in deren Schreibweise), keine leeren oder doppelten Einträge,
 * alles in festen Längen.
 */
function sameText(a: string, b: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase("de-DE").replace(/[^\p{L}\p{N}]+/gu, "");
  return normalize(a) === normalize(b);
}

export function presentationFromOutput(output: PresentationOutput, input: PresentationInput): ProfilePresentation {
  const known = new Map(input.skills.map((skill) => [skill.trim().toLocaleLowerCase("de-DE"), skill.trim()]));
  const used = new Set<string>();
  const focusAreas: FocusArea[] = [];
  for (const area of output.focusAreas) {
    const title = clean(area.title, 40);
    if (!title) continue;
    const skills: string[] = [];
    for (const raw of area.skills) {
      const key = raw.trim().toLocaleLowerCase("de-DE");
      const original = known.get(key);
      if (!original || used.has(key)) continue;
      used.add(key);
      skills.push(original);
      if (skills.length === MAX_SKILLS_PER_AREA) break;
    }
    if (skills.length) focusAreas.push({ title, skills });
    if (focusAreas.length === MAX_FOCUS_AREAS) break;
  }
  const industries = [...new Set(output.industries.map((value) => clean(value, 60)).filter((value): value is string => Boolean(value)))].slice(0, 5);
  return {
    headline: clean(output.headline, 200),
    // Ein „übersetzter“ Text, der dem Original gleicht, ist keine Übersetzung;
    // die Seite zeigt dann das Original, ohne „automatisch übersetzt“.
    summaryDe:
      input.summary && output.summaryDe && !sameText(output.summaryDe, input.summary)
        ? clean(output.summaryDe, 2_400)
        : null,
    focusAreas,
    industries,
    educationShort: clean(output.educationShort, 60),
  };
}

export function presentationRequest(input: PresentationInput, model: string): ResponseCreateParamsNonStreaming {
  const lines = [
    `Rolle: ${input.role}`,
    `Zusammenfassung: ${input.summary ?? "(keine)"}`,
    `Kompetenzen: ${input.skills.join(" | ") || "(keine)"}`,
    `Branchen: ${input.industries.join(" | ") || "(keine)"}`,
    `Abschlüsse: ${input.qualifications.join(" | ") || "(keine)"}`,
  ];
  return {
    model,
    instructions: PRESENTATION_INSTRUCTIONS,
    input: [{ role: "user", content: [{ type: "input_text", text: lines.join("\n") }] }],
    text: { format: zodTextFormat(OutputSchema, "profile_presentation") },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    // Wie bei Projektanalyse und Lebenslauf: nichts beim Anbieter ablegen.
    store: false,
  };
}

export type PresentationResult =
  | { status: "ok"; presentation: ProfilePresentation; model: string }
  | { status: "unavailable" | "failed" | "invalid_output" };

export async function generateProfilePresentation(
  input: PresentationInput,
  options: { responsesClient?: BriefResponsesClient; apiKey?: string | null; timeoutMs?: number } = {},
): Promise<PresentationResult> {
  const apiKey = options.apiKey === undefined ? process.env.OPENAI_API_KEY?.trim() : options.apiKey?.trim();
  const client: BriefResponsesClient | null = options.responsesClient
    ?? (apiKey
      ? {
          async parse(body, requestOptions?: BriefRequestOptions) {
            return createOpenAiClient(apiKey).responses.parse(body, requestOptions);
          },
        }
      : null);
  if (!client) return { status: "unavailable" };

  const model = DEFAULT_OPENAI_BRIEF_MODEL;
  const timeout = options.timeoutMs ?? PRESENTATION_TIMEOUT_MS;
  try {
    const response = await client.parse(presentationRequest(input, model), {
      timeout,
      maxRetries: 0,
      signal: AbortSignal.timeout(timeout + 1_000),
    });
    const parsed = OutputSchema.safeParse(response.output_parsed);
    if (!parsed.success) return { status: "invalid_output" };
    return {
      status: "ok",
      presentation: presentationFromOutput(parsed.data, input),
      model: response.model?.trim() || model,
    };
  } catch {
    return { status: "failed" };
  }
}
