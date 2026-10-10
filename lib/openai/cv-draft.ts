import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { z } from "zod";

import { emptyDraft, type ProfileDraft } from "@/lib/freelancer/import/draft";
import { MAX_TECHNOLOGIES, PROJECT_LIMITS, type ProfileProject } from "@/lib/profile/project-limits";

import {
  DEFAULT_OPENAI_BRIEF_MODEL,
  type BriefRequestOptions,
  type BriefResponsesClient,
} from "./brief";
import { createOpenAiClient } from "./provider";

/**
 * Ein Lebenslauf (PDF) wird zu einem Profilentwurf.
 *
 * Der Entwurf ist ein Vorschlag für das Bewerbungsformular und wird nirgends
 * gespeichert; die Person prüft und ändert ihn, bevor sie absendet. Die KI
 * bewertet nichts und leitet nichts ab: Sie überträgt, was im Dokument steht.
 */

const CvProjectSchema = z.object({
  title: z.string(),
  client: z.string().nullable(),
  industry: z.string().nullable(),
  role: z.string().nullable(),
  startedOn: z.string().nullable(),
  endedOn: z.string().nullable(),
  ongoing: z.boolean(),
  technologies: z.array(z.string()),
  outcome: z.string().nullable(),
  link: z.string().nullable(),
});

export const CvDraftSchema = z.object({
  roleTitle: z.string().nullable(),
  experienceSummary: z.string().nullable(),
  locationText: z.string().nullable(),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  qualifications: z.array(z.string()),
  industries: z.array(z.string()),
  projects: z.array(CvProjectSchema),
});

export type CvDraftOutput = z.infer<typeof CvDraftSchema>;

export const CV_DRAFT_INSTRUCTIONS = [
  "Du überträgst einen Lebenslauf in einen Profilentwurf für eine Freelancer-Plattform.",
  "Übernimm nur, was ausdrücklich im Dokument steht. Erfinde nichts, ergänze nichts aus Allgemeinwissen und bewerte nichts.",
  "Keine Aussagen zu Seniorität, Qualität oder Eignung, keine Wörter wie „erfahren“, „Experte“ oder „hervorragend“, wenn sie nicht wörtlich im Dokument stehen.",
  "Fehlt eine Angabe, gib null bzw. eine leere Liste zurück.",
  "roleTitle: die aktuelle oder zuletzt genannte Berufsbezeichnung, z. B. „Senior Data Engineer“.",
  "experienceSummary: zwei bis vier Sätze in der Ich-Form, nur aus Inhalten des Dokuments, höchstens 900 Zeichen.",
  "locationText: nur Stadt oder Region, nie eine Straße oder Postleitzahl.",
  "skills: fachliche Kompetenzen, Technologien und Methoden, je höchstens drei Wörter, höchstens 25.",
  "languages: Sprachen mit Niveau, wenn genannt, z. B. „Englisch C1“ oder „Deutsch Muttersprache“.",
  "qualifications: Zertifikate und Abschlüsse, z. B. „AWS Solutions Architect Associate“ oder „M.Sc. Informatik“.",
  "industries: Branchen aus ausdrücklich genannten Arbeitgebern, Kunden oder Projekten, z. B. „Versicherungen“. Eine Branche darf vorsichtig normalisiert, aber nicht ohne Beleg im Dokument ergänzt werden.",
  "projects: höchstens acht Projekte oder berufliche Stationen, die neuesten zuerst. title beschreibt Aufgabe oder Station; client enthält den ausdrücklich genannten Arbeitgeber oder Kunden. role ist optional. startedOn und endedOn als JJJJ-MM, sonst null. outcome: ein bis zwei Sätze zu Aufgabe und Ergebnis, nur aus dem Dokument. link enthält nur eine im Dokument ausdrücklich angegebene HTTPS-Adresse zum Arbeitgeber oder Projekt, sonst null.",
  "Übernimm keine Angaben zu Geburtsdatum, Alter, Familienstand, Nationalität, Religion, Gesundheit, Anschrift, Telefonnummer oder E-Mail-Adresse.",
  "Schreibe auf Deutsch, auch wenn das Dokument englisch ist; Fachbegriffe und Technologienamen bleiben im Original.",
].join("\n");

export const CV_DRAFT_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 3_000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;

export type CvDraftResult =
  | { status: "ok"; draft: ProfileDraft; model: string; inputTokens?: number; outputTokens?: number }
  | { status: "unavailable" | "failed" | "invalid_output" };

function month(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return MONTH.test(trimmed) ? trimmed : null;
}

function text(value: string | null, max: number): string | null {
  const trimmed = value?.replace(/\s+/gu, " ").trim() ?? "";
  return trimmed ? trimmed.slice(0, max).trim() : null;
}

/** Projekte aus der KI-Antwort, in den Grenzen des Projekt-Editors. */
function toProjects(projects: CvDraftOutput["projects"]): ProfileProject[] {
  return projects.flatMap((project) => {
    const title = text(project.title, PROJECT_LIMITS.title);
    if (!title) return [];
    const startedOn = month(project.startedOn);
    const endedOn = project.ongoing ? null : month(project.endedOn);
    return [{
      title,
      client: text(project.client, PROJECT_LIMITS.client),
      industry: text(project.industry, PROJECT_LIMITS.industry),
      role: text(project.role, PROJECT_LIMITS.role),
      startedOn,
      endedOn: startedOn && endedOn && endedOn < startedOn ? null : endedOn,
      ongoing: project.ongoing,
      technologies: project.technologies
        .map((value) => text(value, PROJECT_LIMITS.technology))
        .filter((value): value is string => Boolean(value))
        .slice(0, MAX_TECHNOLOGIES),
      outcome: text(project.outcome, PROJECT_LIMITS.outcome),
      link: project.link?.startsWith("https://") ? text(project.link, PROJECT_LIMITS.url) : null,
      isPublic: true,
      verified: false,
      source: "application",
      sourceUrl: null,
    }];
  });
}

export function draftFromCvOutput(output: CvDraftOutput, importedAt: string): ProfileDraft {
  return {
    ...emptyDraft("cv", importedAt),
    roleTitle: text(output.roleTitle, 160),
    experienceSummary: text(output.experienceSummary, 2_000),
    locationText: text(output.locationText, 160),
    skills: output.skills,
    languages: output.languages,
    qualifications: output.qualifications,
    industries: output.industries,
    projects: toProjects(output.projects),
  };
}

export function cvDraftRequest(
  pdf: Uint8Array,
  filename: string,
  model: string,
  safetyIdentifier: string,
): ResponseCreateParamsNonStreaming {
  return {
    model,
    instructions: CV_DRAFT_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename,
            file_data: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`,
          },
          { type: "input_text", text: "Erstelle den Profilentwurf aus diesem Lebenslauf." },
        ],
      },
    ],
    text: { format: zodTextFormat(CvDraftSchema, "freelancer_cv_draft") },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    safety_identifier: safetyIdentifier,
    // Wie bei der Projektanalyse: nichts beim Anbieter ablegen.
    store: false,
  };
}

export async function extractCvDraft(
  input: { pdf: Uint8Array; filename: string; safetyIdentifier: string; now?: Date },
  options: { responsesClient?: BriefResponsesClient; apiKey?: string | null; timeoutMs?: number } = {},
): Promise<CvDraftResult> {
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
  const timeout = options.timeoutMs ?? CV_DRAFT_TIMEOUT_MS;
  try {
    const response = await client.parse(
      cvDraftRequest(input.pdf, input.filename, model, input.safetyIdentifier),
      { timeout, maxRetries: 0, signal: AbortSignal.timeout(timeout + 1_000) },
    );
    const parsed = CvDraftSchema.safeParse(response.output_parsed);
    if (!parsed.success) return { status: "invalid_output" };
    return {
      status: "ok",
      draft: draftFromCvOutput(parsed.data, (input.now ?? new Date()).toISOString()),
      model: response.model?.trim() || model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    };
  } catch {
    return { status: "failed" };
  }
}
