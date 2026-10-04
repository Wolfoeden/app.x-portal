import { describe, expect, it } from "vitest";

import {
  contactDedupeKey,
  contactMailDraft,
  emailKindFrom,
  followUpDate,
  isFollowUpDue,
  mailtoHref,
  parseContactTable,
  splitTable,
} from "@/lib/crm/contacts-model";

// Aufbau wie die Excel-Vorlage „AI_Recruiting_Kontakte_DACH“: zwei Titelzeilen,
// eine Leerzeile, dann die Kopfzeile. Die Daten sind erfunden.
const EXCEL_PASTE = [
  "Recruiting-Kontakte für AI & Automation",
  "Stand: 29.09.2026  •  Persönlich = direkt belegt",
  "",
  [
    "Herkunft",
    "Typ",
    "Unternehmen",
    "Ansprechpartner",
    "Funktion",
    "Region",
    "AI-Bezug / Anzeige",
    "E-Mail-Adresse",
    "E-Mail-Art",
    "E-Mail-Quelle",
    "Projektlink",
    "Hinweis",
  ].join("\t"),
  [
    "Bisherige Liste",
    "Personalberatung",
    "Beispiel Recruiting GmbH",
    "Alex Muster",
    "Principal AI Consultant",
    "DACH / Berlin",
    "Generative AI, Projektbesetzung",
    "Alex.Muster@Beispiel.invalid",
    "Persönlich",
    "https://beispiel.invalid/team/alex",
    "",
    "",
  ].join("\t"),
  [
    "CSV",
    "Personalberatung",
    "Zweite Beratung AG",
    "Nicht genannt",
    "Projektkontakt",
    "Deutschland / Köln",
    "AI Agent Developer, LangGraph",
    "projects@zweite.invalid",
    "Projekt-Postfach",
    "https://zweite.invalid/impressum",
    "https://www.freelancermap.de/projekt/ai-agent-developer",
    "Anzeige nennt keinen individuellen Ansprechpartner.",
  ].join("\t"),
  [
    "CSV",
    "Personalberatung",
    "Ohne Adresse GmbH",
    "Kim Beispiel",
    "Projektkontakt",
    "Deutschland / Frankfurt",
    "AI Solution Architect",
    "",
    "Keine öffentliche E-Mail",
    "https://ohne.invalid/kontakt",
    "javascript:alert(1)",
    "Nur Kontaktformular gefunden.",
  ].join("\t"),
  [
    "CSV",
    "Direkter Auftraggeber",
    "Firma Mit Zentrale",
    "Jo Beispiel",
    "Geschäftsführer",
    "Deutschland",
    "KI-Plattform / AI Agents",
    "info@zentrale.invalid",
    "Zentrale; z. Hd. Person",
    "",
    "",
    "",
  ].join("\t"),
  ["CSV", "Personalberatung", "", "Ohne Firma", "", "", "", "x@y.invalid", "", "", "", ""].join("\t"),
].join("\n");

describe("importing contacts from a table", () => {
  it("finds the header below title rows and maps the Excel columns", () => {
    const parsed = parseContactTable(EXCEL_PASTE);
    expect(parsed.contacts).toHaveLength(4);
    expect(parsed.unmappedHeaders).toEqual(["Herkunft"]);
    expect(parsed.contacts[0]).toEqual({
      company: "Beispiel Recruiting GmbH",
      contactName: "Alex Muster",
      roleTitle: "Principal AI Consultant",
      kind: "Personalberatung",
      region: "DACH / Berlin",
      focus: "Generative AI, Projektbesetzung",
      email: "alex.muster@beispiel.invalid",
      emailKind: "personal",
      emailSourceUrl: "https://beispiel.invalid/team/alex",
      projectUrl: null,
      note: null,
    });
  });

  it("invents nothing: no name from a placeholder, no address where none was given, no unsafe link", () => {
    const [, team, none, office] = parseContactTable(EXCEL_PASTE).contacts;
    expect(team?.contactName).toBeNull();
    expect(team?.emailKind).toBe("team");
    expect(team?.projectUrl).toBe("https://www.freelancermap.de/projekt/ai-agent-developer");
    expect(none?.email).toBeNull();
    expect(none?.emailKind).toBe("none");
    expect(none?.projectUrl).toBeNull();
    expect(office?.emailKind).toBe("company");
  });

  it("reports rows it leaves out", () => {
    const parsed = parseContactTable(EXCEL_PASTE);
    expect(parsed.skipped).toEqual([{ line: 9, reason: "Ohne Unternehmen." }]);
  });

  it("drops duplicates inside the same table and refuses a table without a company column", () => {
    const twice = "Firma;Name;E-Mail\nA GmbH;Eva;eva@a.invalid\nA GmbH;Eva;EVA@a.invalid\n";
    const parsed = parseContactTable(twice);
    expect(parsed.contacts).toHaveLength(1);
    expect(parsed.skipped[0]?.reason).toBe("Doppelt in dieser Tabelle.");
    expect(parseContactTable("Name,Mail\nEva,eva@a.invalid").skipped[0]?.reason).toMatch(/Kopfzeile/u);
  });

  it("reads quoted CSV cells with commas, quotes and line breaks", () => {
    expect(splitTable('Firma,Hinweis\n"A, B GmbH","sagt ""hallo""\nzweite Zeile"\n')).toEqual([
      ["Firma", "Hinweis"],
      ["A, B GmbH", 'sagt "hallo"\nzweite Zeile'],
    ]);
  });

  it("keys a contact by company, person and address, case-insensitively", () => {
    expect(contactDedupeKey({ company: " A  GmbH ", contactName: "Eva", email: "EVA@a.invalid" })).toBe(
      contactDedupeKey({ company: "a gmbh", contactName: "eva", email: "eva@a.invalid" }),
    );
    expect(emailKindFrom("Firmenpostfach", null)).toBe("none");
  });
});

describe("working a contact", () => {
  it("is due when the follow-up date has come and the contact is still open", () => {
    expect(isFollowUpDue({ nextFollowUpOn: "2026-10-02", stage: "contacted" }, "2026-10-02")).toBe(true);
    expect(isFollowUpDue({ nextFollowUpOn: "2026-10-03", stage: "contacted" }, "2026-10-02")).toBe(false);
    expect(isFollowUpDue({ nextFollowUpOn: "2026-09-01", stage: "do_not_contact" }, "2026-10-02")).toBe(false);
  });

  it("moves a follow-up off the weekend", () => {
    // Freitag + 1 Tag = Samstag → Montag.
    expect(followUpDate(new Date("2026-10-02T10:00:00Z"), 1)).toBe("2026-10-05");
    expect(followUpDate(new Date("2026-10-02T10:00:00Z"), 7)).toBe("2026-10-09");
  });

  it("drafts a personal mail with the occasion, a way in without an account and the origin of the address", () => {
    const draft = contactMailDraft({
      company: "Zweite Beratung AG",
      contactName: null,
      focus: "AI Agent Developer, LangGraph",
      projectUrl: "https://www.freelancermap.de/projekt/ai-agent-developer",
      emailSourceUrl: "https://zweite.invalid/impressum",
    });
    expect(draft.subject).toBe("Freelancer für AI Agent Developer – XPORTAL");
    expect(draft.body).toMatch(/^Guten Tag,\n/u);
    expect(draft.body).toContain("Ausschreibung gesehen (https://www.freelancermap.de/projekt/ai-agent-developer)");
    expect(draft.body).toContain("https://x-portal.eu/chat?beispiel=ai-agenten");
    expect(draft.body).toContain("Ihre Adresse stammt aus https://zweite.invalid/impressum");
    expect(draft.body).toContain("keine weiteren Nachrichten");
  });

  it("encodes the draft for mailto with %20 instead of +", () => {
    const href = mailtoHref("eva@a.invalid", { subject: "Hallo Welt", body: "A & B" });
    expect(href).toBe("mailto:eva@a.invalid?subject=Hallo%20Welt&body=A%20%26%20B");
  });
});
