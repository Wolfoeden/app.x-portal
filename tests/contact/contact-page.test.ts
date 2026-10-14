import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import ContactPage from "@/app/contact/page";
import { contactInquiryFromForm } from "@/lib/contact/inquiry";
import { topicsFromQuery } from "@/lib/contact/topics";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";

async function render(query: Record<string, string | string[]> = {}): Promise<string> {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return renderToStaticMarkup(await ContactPage({ searchParams: Promise.resolve(query) }));
}

function selected(markup: string, value: string): boolean {
  return new RegExp(`<option value="${value}" selected=""`, "u").test(markup);
}

// Oktober 2026: Die Kontaktseite folgt dem Telefonleitfaden und bleibt kurz
// (Rückmeldung: zu viel Text, zu viele Häkchen). Ein Thema statt neun
// Häkchen; wer über das Menü kommt, landet oben mit passender Überschrift.
describe("contact page", () => {
  it("shows the person, phone and calendar", async () => {
    const markup = await render();
    expect(markup).toContain(SALES_CONTACT.name);
    expect(markup).toContain("Produktmanager");
    expect(markup).toContain('href="tel:+491758934338"');
    expect(markup).toContain(SALES_CONTACT.phone);
    expect(markup).toContain("https://calendly.com/romandering/30min?utm_source=x-portal");
  });

  it("lists the five use cases and three competences in one line each", async () => {
    const markup = await render();
    for (const title of [
      "Kundenservice",
      "Vertrieb",
      "Daten und Störungen",
      "Mitarbeiterwissen",
      "Lager und Logistik",
      "KI-Schulungen",
      "Cybersecurity-Anforderungen",
      "ISMS und ISO 27001",
    ]) {
      expect(markup).toContain(`<strong>${title}</strong>`);
    }
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).toContain('id="anfrage"');
  });

  it("puts the topic from the menu into the headline and the form", async () => {
    const training = await render({ thema: "schulung" });
    expect(training).toContain("KI sicher im Alltag nutzen.");
    expect(selected(training, "schulung")).toBe(true);

    const security = await render({ thema: "iso27001" });
    expect(security).toContain("die Audits standhält.");
    expect(selected(security, "iso27001")).toBe(true);

    expect(await render()).toContain("Weniger Routinearbeit.");
  });

  it("keeps the old menu links working", async () => {
    expect(topicsFromQuery(undefined, "Compliance Check")).toEqual(["iso27001"]);
    expect(topicsFromQuery(undefined, "KI-Webinar")).toEqual(["schulung"]);
    expect(topicsFromQuery(["vertrieb,unbekannt", "LAGER"], undefined)).toEqual(["vertrieb", "lager"]);
    expect(selected(await render({ betreff: "KI-Webinar" }), "schulung")).toBe(true);
  });

  it("posts to the contact route without JavaScript", async () => {
    const markup = await render({ status: "sent" });
    expect(markup).toContain('action="/api/contact"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain("Eingegangen");
  });

  it("calls back when a phone number is given, otherwise answers by mail", () => {
    const form = (fields: Record<string, string>) => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.append(key, value);
      return contactInquiryFromForm(data) as { way: string };
    };
    expect(form({ topic: "lager", phone: "+49 30 123456" }).way).toBe("rueckruf");
    expect(form({ topic: "lager" }).way).toBe("email");
  });
});
