import { describe, expect, it } from "vitest";

import { profileCheck, VERIFICATION_HELP } from "@/components/chat/verification";

// Audit F07: Je Prüfstatus kurz erklären, was geprüft wurde, und keinen
// Eindruck einer Kompetenzprüfung erwecken, wenn nur Angaben gesichtet wurden.
describe("what the verification labels mean", () => {
  it("explains every label the profile shows", () => {
    expect(VERIFICATION_HELP.map((entry) => entry.term)).toEqual([
      "Von XPORTAL geprüft",
      "Vom Freelancer angegeben",
      "Profilprüfung",
    ]);
  });

  it("says what a checked statement is checked against, and that skill is not tested", () => {
    const checked = VERIFICATION_HELP[0]!.text;
    expect(checked).toContain("mit einem Nachweis abgeglichen");
    expect(checked).toContain("Lebenslauf, Zertifikat oder öffentlichem Berufsprofil");
    expect(checked).toContain("nicht wie gut jemand arbeitet");
    expect(VERIFICATION_HELP[1]!.text).toContain("nicht einzeln geprüft");
  });

  it("does not call a completed profile check a reference check", () => {
    expect(profileCheck("Verifiziert")).toEqual({ text: "Profilprüfung durch XPORTAL abgeschlossen", verified: true });
    expect(profileCheck("Verifiziert")?.text).not.toMatch(/Referenz/u);
  });

  it("keeps unchecked profiles unchecked", () => {
    expect(profileCheck("Selbstauskunft")).toEqual({ text: "Angaben laut Freelancer; Referenzen nicht geprüft", verified: false });
    expect(profileCheck("Nicht verifiziert")).toEqual({ text: "Noch nicht von XPORTAL geprüft", verified: false });
    expect(profileCheck("Teilweise geprüft")).toEqual({ text: "Prüfstatus: Teilweise geprüft", verified: false });
    expect(profileCheck(null)).toBeNull();
  });
});
