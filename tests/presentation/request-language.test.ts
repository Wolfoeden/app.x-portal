import { describe, expect, it } from "vitest";

import {
  deriveUnknownFields,
  parseFallbackBrief,
  ProjectBriefSchema,
  type ProjectBrief,
} from "@/lib/domain";
import { presentBrief } from "@/lib/presentation/chat";
import { detectRequestLanguage } from "@/lib/presentation/request-language";

function makeBrief(patch: Partial<ProjectBrief> = {}): ProjectBrief {
  const fallback = parseFallbackBrief("React freelancer, remote");
  const candidate = { ...fallback, ...patch };
  return ProjectBriefSchema.parse({
    ...candidate,
    unknownFields: deriveUnknownFields(candidate),
  });
}

describe("detectRequestLanguage", () => {
  it("recognises a German request", () => {
    expect(
      detectRequestLanguage(
        "Wir suchen einen Entwickler fuer ein Projekt und brauchen Unterstuetzung.",
      ),
    ).toBe("German");
  });

  it("recognises an English request", () => {
    expect(
      detectRequestLanguage(
        "We are looking for a developer who has experience with this project.",
      ),
    ).toBe("English");
  });

  it("treats umlauts as a decisive German signal", () => {
    expect(detectRequestLanguage("Bauüberwachung für Straßenbau gesucht")).toBe("German");
  });

  it("returns null when the text is too short to judge", () => {
    expect(detectRequestLanguage("Hallo")).toBeNull();
    expect(detectRequestLanguage("SAP MM")).toBeNull();
  });

  it("returns null rather than guessing on an ambiguous text", () => {
    // Product and skill names carry no language signal. Showing the wrong
    // language here would be worse than showing none.
    expect(detectRequestLanguage("Kubernetes Terraform Docker Python AWS")).toBeNull();
  });
});

describe("presentBrief language handling", () => {
  it("marks an explicitly requested language as a requirement", () => {
    const brief = makeBrief({
      originalRequest: "Wir brauchen einen Entwickler und suchen Unterstuetzung.",
      language: "French",
    });

    const result = presentBrief(brief);

    expect(result.languages).toEqual(["French"]);
    expect(result.languageSource).toBe("required");
  });

  it("falls back to the language the request was written in", () => {
    const brief = makeBrief({
      originalRequest: "Wir suchen einen Entwickler und brauchen Unterstuetzung fuer das Projekt.",
      language: null,
    });

    const result = presentBrief(brief);

    expect(result.languages).toEqual(["German"]);
    expect(result.languageSource).toBe("detected");
  });

  it("shows nothing when neither a requirement nor a clear signal exists", () => {
    const brief = makeBrief({ originalRequest: "SAP MM", language: null });

    const result = presentBrief(brief);

    expect(result.languages).toEqual([]);
    expect(result.languageSource).toBeNull();
  });

  it("never turns a detected language into a matching requirement", () => {
    // The brief that drives matching must stay untouched. If the detected
    // language leaked into brief.language, every German request would silently
    // gain a language filter the client never asked for.
    const brief = makeBrief({
      originalRequest: "Wir suchen einen Entwickler und brauchen Unterstuetzung.",
      language: null,
    });

    expect(presentBrief(brief).languageSource).toBe("detected");
    expect(brief.language).toBeNull();
  });
});
