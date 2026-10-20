import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(async () => "trace"),
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
  currentUser: vi.fn(async () => null as unknown),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/audit/write", () => ({ writeAuditEvent: mocks.audit }));
vi.mock("@/lib/security/shared-rate-limit", () => ({ consumeRateLimit: mocks.rateLimit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.currentUser }));

import { POST as viewed } from "@/app/api/sales-call/view/route";
import { ContactStatusNotice, legacyTopicPath } from "@/app/contact/ContactNotice";
import ContactTopicPage, { generateStaticParams } from "@/app/contact/[thema]/page";
import ContactPage from "@/app/contact/page";
import { contactInquiryFromForm } from "@/lib/contact/inquiry";
import { CONTACT_TOPICS, topicsFromQuery } from "@/lib/contact/topics";
import { salesCallHref } from "@/lib/sales/sales-call-links";
import { SALES_CONTACT } from "@/lib/sales/sales-contact-model";

async function render(thema?: string): Promise<string> {
  return renderToStaticMarkup(thema ? await ContactTopicPage({ params: Promise.resolve({ thema }) }) : ContactPage());
}

function selected(markup: string, value: string): boolean {
  return new RegExp(`<option value="${value}" selected=""`, "u").test(markup);
}

function view(body: unknown) {
  return viewed(new Request("https://x-portal.eu/api/sales-call/view", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://x-portal.eu", host: "x-portal.eu" },
    body: JSON.stringify(body),
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

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

  // 18.10.2026: je Thema eine statische Seite statt `?thema=`, damit die
  // Seite aus dem CDN kommt und die Überschrift nicht nachträglich wechselt.
  it("puts the topic of the page into the headline and the form", async () => {
    const training = await render("schulung");
    expect(training).toContain("KI sicher im Alltag nutzen.");
    expect(training).toContain("Art. 4 der KI-Verordnung verlangt, die KI-Kompetenz der Mitarbeitenden zu fördern.");
    expect(training).not.toMatch(/Pflicht aus Art\. 4/u);
    expect(selected(training, "schulung")).toBe(true);

    const security = await render("iso27001");
    expect(security).toContain("die Audits standhält.");
    expect(selected(security, "iso27001")).toBe(true);

    expect(await render()).toContain("Weniger Routinearbeit.");
    expect(generateStaticParams().map((params) => params.thema)).toEqual(CONTACT_TOPICS.map((topic) => topic.key));
    expect(await render()).toContain('href="/contact/kundenservice#anfrage"');
  });

  // 14.10.2026: „Gespräch vereinbaren“ hatte eine eigene Seite. Jetzt führt
  // es hierher; von den Seiten zum Talent Index mit dem Thema Freelancer.
  it("is the page behind every „Gespräch vereinbaren“", async () => {
    expect(salesCallHref("hero")).toBe("/contact/freelancer?von=hero");
    const markup = await render("freelancer");
    expect(markup).toContain("Sprechen wir über Ihr Projekt.");
    expect(selected(markup, "freelancer")).toBe(true);
  });

  // Die Seite ist statisch; den Aufruf meldet der Browser (ContactNotice).
  it("counts the visit with where it came from, the topic and the account", async () => {
    expect((await view({ von: "hero", thema: "freelancer" })).status).toBe(204);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "sales_call_viewed",
      metadata: { via: "hero", topic: "freelancer", account: "none" },
    }));

    mocks.audit.mockClear();
    mocks.currentUser.mockResolvedValueOnce({ id: "u1", isAnonymous: false });
    await view({ von: "evil", thema: "<script>" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "u1",
      metadata: { via: "direct", topic: null, account: "registered" },
    }));
  });

  it("keeps the old menu links working", () => {
    expect(topicsFromQuery(undefined, "Compliance Check")).toEqual(["iso27001"]);
    expect(topicsFromQuery(undefined, "KI-Webinar")).toEqual(["schulung"]);
    expect(topicsFromQuery(["vertrieb,unbekannt", "LAGER"], undefined)).toEqual(["vertrieb", "lager"]);
    expect(legacyTopicPath("?betreff=KI-Webinar")).toBe("/contact/schulung");
    expect(legacyTopicPath("?thema=freelancer&von=hero", "#anfrage")).toBe("/contact/freelancer?von=hero#anfrage");
    expect(legacyTopicPath("?von=hero")).toBeNull();
    expect(legacyTopicPath("?thema=unbekannt")).toBeNull();
  });

  it("posts to the contact route without JavaScript and confirms afterwards", async () => {
    const markup = await render();
    expect(markup).toContain('action="/api/contact"');
    expect(markup).toContain('method="post"');

    const sent = renderToStaticMarkup(createElement(ContactStatusNotice, { search: "?status=sent&t=abc.def" }));
    expect(sent).toContain("Eingegangen");
    expect(sent).toContain('href="/contact/termin?t=abc.def"');
    expect(renderToStaticMarkup(createElement(ContactStatusNotice, { search: "?status=sent" }))).toContain('href="/contact/termin?von=contact"');
    expect(renderToStaticMarkup(createElement(ContactStatusNotice, { search: "?status=error" }))).toContain("Nicht gespeichert");
    expect(renderToStaticMarkup(createElement(ContactStatusNotice, { search: "?status=invalid" }))).toContain("Bitte prüfen");
    expect(renderToStaticMarkup(createElement(ContactStatusNotice, { search: "" }))).toBe("");
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
