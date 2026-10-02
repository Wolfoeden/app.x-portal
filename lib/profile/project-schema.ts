import { z } from "zod";

import {
  LINK_KINDS,
  MAX_LINKS,
  MAX_PROJECTS,
  MAX_TECHNOLOGIES,
  PROJECT_LIMITS,
  PROJECT_SOURCES,
  type ProfileProject,
} from "@/lib/profile/project-limits";

const optionalText = (max: number, min = 2) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value && value.length >= min ? value : null));

const httpsUrl = z
  .string()
  .trim()
  .max(PROJECT_LIMITS.url)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.includes(".") && !/\s/u.test(value);
    } catch {
      return false;
    }
  }, "Bitte eine vollständige https-Adresse angeben.");

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/u, "Monat als JJJJ-MM.")
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const ProjectInputSchema = z
  .object({
    title: z.string().trim().min(3, "Titel mit mindestens drei Zeichen.").max(PROJECT_LIMITS.title),
    client: optionalText(PROJECT_LIMITS.client),
    industry: optionalText(PROJECT_LIMITS.industry),
    role: optionalText(PROJECT_LIMITS.role),
    startedOn: month,
    endedOn: month,
    ongoing: z.boolean().default(false),
    technologies: z
      .array(z.string().trim().min(1).max(PROJECT_LIMITS.technology).refine((value) => !value.includes(":"), "Ohne Doppelpunkt."))
      .max(MAX_TECHNOLOGIES)
      .default([])
      .transform((values) => [...new Map(values.map((value) => [value.toLowerCase(), value])).values()]),
    outcome: optionalText(PROJECT_LIMITS.outcome, 10),
    link: httpsUrl.nullable().optional().transform((value) => value ?? null),
    isPublic: z.boolean().default(true),
    verified: z.boolean().default(false),
    source: z.enum(PROJECT_SOURCES).default("operator"),
    sourceUrl: httpsUrl.nullable().optional().transform((value) => value ?? null),
  })
  .strict()
  .superRefine((project, context) => {
    if (project.ongoing && project.endedOn) {
      context.addIssue({ code: "custom", path: ["endedOn"], message: "Ein laufendes Projekt hat kein Ende." });
    }
    if (project.startedOn && project.endedOn && project.endedOn < project.startedOn) {
      context.addIssue({ code: "custom", path: ["endedOn"], message: "Das Ende liegt vor dem Beginn." });
    }
    if (project.source === "research" && !project.sourceUrl) {
      context.addIssue({ code: "custom", path: ["sourceUrl"], message: "Recherchierte Projekte brauchen eine Quelle." });
    }
  });

export const ProjectListSchema = z.array(ProjectInputSchema).max(MAX_PROJECTS, `Höchstens ${MAX_PROJECTS} Projekte.`);

export const ProfileLinksSchema = z
  .array(z.object({ kind: z.enum(LINK_KINDS), url: httpsUrl }).strict())
  .max(MAX_LINKS, `Höchstens ${MAX_LINKS} Links.`)
  .transform((links) => [...new Map(links.map((link) => [link.url, link])).values()]);

export type ProjectInput = z.output<typeof ProjectInputSchema>;

export function asProfileProject(input: ProjectInput): ProfileProject {
  return input;
}
