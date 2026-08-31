import { describe, expect, it } from "vitest";

import {
  briefToDraft,
  composeBriefUpdateMessage,
  draftChanges,
} from "@/components/chat/brief-editor";
import { previewBrief } from "@/components/chat/preview-fixtures";

describe("brief editor", () => {
  it("seeds every field from the structured brief", () => {
    const draft = briefToDraft(previewBrief);

    expect(draft.projectTitle).toBe(previewBrief.projectTitle);
    expect(draft.location).toBe(previewBrief.location);
    expect(draft.mode).toBe(previewBrief.mode);
    expect(draft.languages).toBe(previewBrief.languages.join(", "));
    expect(draft.hardRequirements.length).toBeGreaterThan(0);
  });

  it("starts empty when no brief exists yet", () => {
    const draft = briefToDraft(null);

    expect(draft.projectTitle).toBe("");
    expect(draft.mode).toBe("unknown");
    expect(Object.values(draft).every((value) => value === "" || value === "unknown")).toBe(true);
  });

  it("reports only the fields the user actually touched", () => {
    const base = briefToDraft(previewBrief);
    const changes = draftChanges(base, { ...base, location: "Hamburg" });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ field: "location", label: "Ort", value: "Hamburg" });
  });

  // Eine Suche kostet Guthaben. Ein Leerzeichen, das beim Klicken ins Feld
  // entsteht, darf sie nicht ausloesen.
  it("ignores a change that is only whitespace", () => {
    const base = briefToDraft(previewBrief);

    expect(draftChanges(base, { ...base, location: `  ${base.location}  ` })).toEqual([]);
    expect(draftChanges(base, base)).toEqual([]);
  });

  it("names a cleared field as dropped instead of leaving it out", () => {
    const base = briefToDraft(previewBrief);
    expect(base.availabilityRequirement).not.toBe("");

    const message = composeBriefUpdateMessage(
      draftChanges(base, { ...base, availabilityRequirement: "" }),
    );

    expect(message).toContain("Verfügbarkeit: entfällt");
  });

  // Ein Feld, das im Steckbrief noch leer ist, bleibt beim Leeren unveraendert
  // — sonst meldete die Leiste eine Aenderung, die es nicht gibt.
  it("does not treat an already empty field as a change", () => {
    const base = briefToDraft(previewBrief);
    expect(base.budgetOrRate).toBe("");

    expect(draftChanges(base, { ...base, budgetOrRate: "" })).toEqual([]);
  });

  it("writes the readable label for the work mode, not the raw value", () => {
    const base = briefToDraft(previewBrief);
    const message = composeBriefUpdateMessage(draftChanges(base, { ...base, mode: "on-site" }));

    expect(message).toContain("Arbeitsmodus: Vor Ort");
    expect(message).not.toContain("on-site");
  });

  it("asks for a fresh search and lists every changed field", () => {
    const base = briefToDraft(previewBrief);
    const message = composeBriefUpdateMessage(
      draftChanges(base, { ...base, location: "Hamburg", duration: "3 Monate" }),
    );

    expect(message).toContain("erneut");
    expect(message).toContain("- Ort: Hamburg");
    expect(message).toContain("- Dauer: 3 Monate");
  });

  it("stays empty when nothing changed, so no search is triggered", () => {
    expect(composeBriefUpdateMessage([])).toBe("");
  });
});
