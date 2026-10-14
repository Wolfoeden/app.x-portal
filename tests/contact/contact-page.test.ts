import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import ContactPage from "@/app/contact/page";
import { topicsFromQuery } from "@/lib/contact/topics";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";

async function render(query: Record<string, string | string[]> = {}): Promise<string> {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return renderToStaticMarkup(await ContactPage({ searchParams: Promise.resolve(query) }));
}

function checked(markup: string, value: string): boolean {
  return new RegExp(`<input[^>]*value="${value}"[^>]*checked=""`, "u").test(markup)
    || new RegExp(`<input[^>]*checked=""[^>]*value="${value}"`, "u").test(markup);
}

// Oktober 2026: Die Kontaktseite folgt dem Telefonleitfaden (KI-Agenten,
// bekannte Einsatzfälle, Kompetenzen) und bleibt der Kontaktweg für alles.
describe("contact page", () => {
  it("shows the person, phone and calendar from the call", async () => {
    const markup = await render();
    expect(markup).toContain("Wir haben telefoniert?");
    expect(markup).toContain(SALES_CONTACT.name);
    expect(markup).toContain("Produktmanager");
    expect(markup).toContain('href="tel:+491758934338"');
    expect(markup).toContain(SALES_CONTACT.phone);
    expect(markup).toContain("https://calendly.com/romandering/30min?utm_source=x-portal");
  });

  it("names the five known use cases and the three competences", async () => {
    const markup = await render();
    for (const title of [
      "Kundenservice automatisieren",
      "Vertrieb automatisieren",
      "Daten auswerten, auf Störungen reagieren",
      "Mitarbeiterwissen zentralisieren",
      "Lagerhallen optimieren",
      "KI-Schulungen",
      "Cybersecurity-Anforderungsmanagement",
      "ISMS und ISO/IEC 27001",
    ]) {
      expect(markup).toContain(title);
    }
    for (const id of ["ki-agenten", "ki-schulungen", "informationssicherheit", "anfrage"]) {
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it("ticks the topic from a link sent after the call", async () => {
    const markup = await render({ thema: "lager", weg: "rueckruf" });
    expect(checked(markup, "lager")).toBe(true);
    expect(checked(markup, "kundenservice")).toBe(false);
    expect(checked(markup, "rueckruf")).toBe(true);
  });

  it("keeps the old menu links working", async () => {
    expect(topicsFromQuery(undefined, "Compliance Check")).toEqual(["iso27001"]);
    expect(topicsFromQuery(undefined, "KI-Webinar")).toEqual(["schulung"]);
    expect(topicsFromQuery(["vertrieb,unbekannt", "LAGER"], undefined)).toEqual(["vertrieb", "lager"]);
    expect(checked(await render({ betreff: "KI-Webinar" }), "schulung")).toBe(true);
  });

  it("posts to the contact route without JavaScript", async () => {
    const markup = await render({ status: "sent" });
    expect(markup).toContain('action="/api/contact"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain("Eingegangen");
    expect(checked(markup, "email")).toBe(true);
  });
});
