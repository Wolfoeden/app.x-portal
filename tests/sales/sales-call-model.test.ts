import { describe, expect, it } from "vitest";

import {
  SALES_CALL_KIND,
  SalesCallSchema,
  isSalesCallEntry,
  salesCalendarUrl,
  salesCallAcknowledgementMessage,
  salesCallFromForm,
  salesCallHref,
  salesCallNote,
  salesCallNotificationMessage,
} from "@/lib/sales/sales-call-model";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const valid = {
  company: "Muster Maschinenbau GmbH",
  fullName: "Erika Mustermann",
  email: "Erika@Muster.example",
  role: "KI-Entwickler für einen Agenten auf Basis unserer Dokumente",
  phone: "+49 30 1234567",
  start: "November",
  duration: "3 Monate",
  rate: "bis 800 €",
  note: "Remote möglich, zwei Tage vor Ort im Monat.",
  consent: "on",
};

describe("SalesCallSchema", () => {
  it("accepts a complete request and normalises the address", () => {
    const parsed = SalesCallSchema.parse(salesCallFromForm(form(valid)));
    expect(parsed.email).toBe("erika@muster.example");
    expect(parsed.phone).toBe("+49 30 1234567");
    expect(parsed.website).toBe("");
  });

  it("turns empty optional fields into null", () => {
    const parsed = SalesCallSchema.parse(
      salesCallFromForm(form({ ...valid, phone: "", start: " ", duration: "", rate: "", note: "" })),
    );
    expect(parsed).toMatchObject({ phone: null, start: null, duration: null, rate: null, note: null });
  });

  it("requires the privacy checkbox", () => {
    const withoutConsent: Record<string, string> = { ...valid };
    delete withoutConsent.consent;
    expect(SalesCallSchema.safeParse(salesCallFromForm(form(withoutConsent))).success).toBe(false);
  });

  it("rejects a phone number that is not one", () => {
    expect(SalesCallSchema.safeParse(salesCallFromForm(form({ ...valid, phone: "ruf mich an" }))).success).toBe(false);
  });

  it("requires company, name, address and role", () => {
    for (const field of ["company", "fullName", "email", "role"] as const) {
      expect(SalesCallSchema.safeParse(salesCallFromForm(form({ ...valid, [field]: "" }))).success, field).toBe(false);
    }
  });
});

describe("salesCallNote", () => {
  it("puts the role first and keeps the free text", () => {
    const note = salesCallNote(SalesCallSchema.parse(salesCallFromForm(form(valid))));
    expect(note.split("\n")[0]).toBe(`Gesucht: ${valid.role}`);
    expect(note).toContain("Start: November");
    expect(note).toContain("Telefon: +49 30 1234567");
    expect(note).toContain(valid.note);
  });

  it("names the profile the request came from", () => {
    const id = "0b5c2b9e-3c55-4a43-9a7e-2f1d6c7a8b90";
    const note = salesCallNote(SalesCallSchema.parse(salesCallFromForm(form({ ...valid, profileId: id }))));
    expect(note).toContain(`Interesse an Profil: https://x-portal.eu/profil/${id}`);
    expect(SalesCallSchema.safeParse(salesCallFromForm(form({ ...valid, profileId: "../admin" }))).success).toBe(false);
  });

  it("stays within the column limit", () => {
    const note = salesCallNote(
      SalesCallSchema.parse(salesCallFromForm(form({ ...valid, note: "x".repeat(2_000) }))),
    );
    expect(note.length).toBe(2_000);
  });
});

describe("salesCalendarUrl", () => {
  it("prefills name, address and role", () => {
    const url = new URL(
      salesCalendarUrl("https://calendly.com/xportal/20min", {
        fullName: "Erika Mustermann",
        email: "erika@muster.example",
        role: "SAP S/4HANA",
      })!,
    );
    expect(url.origin + url.pathname).toBe("https://calendly.com/xportal/20min");
    expect(url.searchParams.get("name")).toBe("Erika Mustermann");
    expect(url.searchParams.get("email")).toBe("erika@muster.example");
    expect(url.searchParams.get("a1")).toBe("SAP S/4HANA");
    expect(url.searchParams.get("utm_source")).toBe("x-portal");
  });

  it("accepts only https links", () => {
    expect(salesCalendarUrl("http://calendly.com/xportal")).toBeNull();
    expect(salesCalendarUrl("javascript:alert(1)")).toBeNull();
    expect(salesCalendarUrl("calendly.com/xportal")).toBeNull();
    expect(salesCalendarUrl("")).toBeNull();
    expect(salesCalendarUrl(undefined)).toBeNull();
  });
});

describe("mails", () => {
  const input = SalesCallSchema.parse(salesCallFromForm(form(valid)));

  it("tells the operator everything and links the contact", () => {
    const message = salesCallNotificationMessage(input, { contactUrl: "https://x-portal.eu/chat/admin/kontakte/abc" });
    expect(message.subject).toBe(`Gesprächsanfrage: ${valid.company} – ${valid.role}`.slice(0, 180));
    expect(message.text).toContain("erika@muster.example");
    expect(message.text).toContain(valid.note);
    expect(message.text).toContain("https://x-portal.eu/chat/admin/kontakte/abc");
  });

  it("confirms to the sender without quoting free text", () => {
    const message = salesCallAcknowledgementMessage(input, "https://calendly.com/xportal/20min?name=Erika");
    expect(message.text).toContain("Guten Tag Erika Mustermann,");
    expect(message.text).toContain("https://calendly.com/xportal/20min?name=Erika");
    expect(message.text).not.toContain(valid.note);
    expect(message.text).not.toContain(valid.role);
  });

  it("promises a call back when no calendar is set up", () => {
    const message = salesCallAcknowledgementMessage(input, null);
    expect(message.text).not.toContain("https://calendly");
    expect(message.text).toContain("Wir melden uns");
  });
});

describe("entries", () => {
  it("builds tracked links and rejects unknown sources", () => {
    expect(salesCallHref("header")).toBe("/gespraech?von=header");
    expect(isSalesCallEntry("pricing")).toBe(true);
    expect(isSalesCallEntry("evil")).toBe(false);
    expect(SALES_CALL_KIND).toBe("Gesprächsanfrage (Website)");
  });
});
