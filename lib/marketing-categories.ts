import { SKILL_TAXONOMY } from "@/lib/domain/skill-taxonomy";

/** Editorial groups of existing vocabulary; no promise of current pool coverage. */
function catalogSkills(names: readonly string[]): string[] {
  return names.map((name) => {
    const skill = SKILL_TAXONOMY.find((entry) => entry.canonical === name);
    if (!skill) throw new Error("Marketing skill missing from product taxonomy: " + name);
    return skill.canonical;
  });
}

export const MARKETING_CATEGORIES = [
  {
    title: "Anforderungen & Prozesse",
    description: "Fachliche Anforderungen aufnehmen, Abläufe beschreiben und die Umsetzung vorbereiten.",
    skills: catalogSkills(["Requirements Management", "Business Analysis", "Process Management"]),
  },
  {
    title: "SAP & Integration",
    description: "Unternehmenssysteme weiterentwickeln und Schnittstellen im Projektkontext einordnen.",
    skills: catalogSkills(["SAP S/4HANA", "SAP Integration", "SAP Customizing"]),
  },
  {
    title: "KI & Automatisierung",
    description: "Sprachmodelle, Dokumentensuche und automatisierte Geschäftsprozesse als konkrete Aufgabe beschreiben.",
    skills: catalogSkills(["Large Language Models", "RAG", "Business Process Automation"]),
  },
  {
    title: "Softwareentwicklung",
    description: "Anwendungen und Schnittstellen entwickeln. Benennen Sie den benötigten Stack und die Aufgabe.",
    skills: catalogSkills(["React", "TypeScript", "Python", "Node.js"]),
  },
] as const;
