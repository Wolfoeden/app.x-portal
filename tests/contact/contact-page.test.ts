import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ audit: vi.fn(async () => undefined) }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void task(),
}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => null }));

import ContactPage from "@/app/contact/page";
import { contactInquiryFromForm } from "@/lib/contact/inquiry";
import { topicsFromQuery } from "@/lib/contact/topics";
import { salesCallHref } from "@/lib/sales/sales-call-links";
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
    // Seit 18.10.2026 direkt zum Kalender (der Klick zählt nebenher); ein
    // Knopf, nicht zwei.
    expect(markup).toMatch(/href="https:\/\/calendly\.com\/romandering\/30min\?utm_source=x-portal"[^>]*>Gespräch vereinbaren</u);
    expect(markup).not.toContain("/contact/termin");
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

  // 14.10.2026: „Gespräch vereinbaren“ hatte eine eigene Seite. Jetzt führt
  // es hierher; von den Seiten zum Talent Index mit dem Thema Freelancer.
  it("is the page behind every „Gespräch vereinbaren“", async () => {
    expect(salesCallHref("hero")).toBe("/contact?thema=freelancer&von=hero");
    const markup = await render({ thema: "freelancer", von: "hero" });
    expect(markup).toContain("Sprechen wir über Ihr Projekt.");
    expect(selected(markup, "freelancer")).toBe(true);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sales_call_viewed", metadata: expect.objectContaining({ via: "hero", topic: "freelancer" }) }),
    );

    mocks.audit.mockClear();
    await render({ von: "evil" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ via: "direct" }) }));
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
