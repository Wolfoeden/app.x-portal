import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ConversationItem } from "@/components/chat-contract";
import { ConversationsPage } from "@/components/chat/conversations";
import { PlacementDialog } from "@/components/chat/placement-dialog";
import { ChatWorkspace } from "@/components/ChatWorkspace";
import { FreelancerLanding } from "@/components/marketing/FreelancerLanding";
import type { FreelancerProfileResult } from "@/components/chat-contract";

afterEach(() => vi.unstubAllEnvs());

const ITEM: ConversationItem = {
  id: "66666666-6666-4666-8666-666666666666",
  role: "client",
  projectTitle: "Datenplattform",
  counterpartName: "Mira Falk",
  counterpartDetail: "Data Engineer",
  profileId: "22222222-2222-4222-8222-222222222222",
  stage: "introduced",
  requestedAt: "2026-10-01T10:00:00.000Z",
  introducedAt: "2026-10-02T10:00:00.000Z",
  answer: null,
  answeredAt: null,
  engagementRecorded: false,
  question: 1,
  hasCalendar: true,
};

function page(items: ConversationItem[], isAccountUser = true) {
  return renderToStaticMarkup(
    createElement(ConversationsPage, {
      items,
      loading: false,
      error: null,
      linkInvalid: false,
      isAccountUser,
      onAnswer: async () => undefined,
      onSignup: () => undefined,
    }),
  );
}

describe("Gespräche", () => {
  it("asks the client whether they hired, with three answers", () => {
    const html = page([ITEM]);
    expect(html).toContain("Haben Sie Mira Falk beauftragt?");
    for (const label of ["Ja, beauftragt", "Noch im Gespräch", "Nein"]) expect(html).toContain(`>${label}</button>`);
    expect(html).toContain("Kostenlos bis zur Beauftragung");
    expect(html).toContain("/api/freelancers/22222222-2222-4222-8222-222222222222/book");
  });

  it("asks the freelancer from their side and keeps it free for them", () => {
    const html = page([{ ...ITEM, role: "freelancer", counterpartName: "Firma GmbH", hasCalendar: false }]);
    expect(html).toContain("Anfrage an Sie");
    expect(html).toContain("Hat Firma GmbH Sie beauftragt?");
    expect(html).toContain("Für Sie bleibt die Vermittlung kostenlos.");
  });

  it("shows the waiting state before the introduction and no question", () => {
    const html = page([{ ...ITEM, stage: "requested", introducedAt: null, question: null }]);
    expect(html).toContain("wird geprüft");
    expect(html).toContain("XPORTAL prüft die Verfügbarkeit");
    expect(html).not.toContain("beauftragt?");
  });

  it("lets a side report early without a pending question", () => {
    const html = page([{ ...ITEM, question: null }]);
    expect(html).toContain("<summary>Stand melden</summary>");
  });

  it("invites a guest with requests to keep them across devices", () => {
    expect(page([ITEM], false)).toContain("Konto anlegen</button>, um sie auf jedem Gerät zu sehen");
    expect(page([], false)).toContain("Noch keine Gespräche");
  });
});

const PROFILE = {
  id: "22222222-2222-4222-8222-222222222222",
  displayName: "Mira Falk",
  role: "Data Engineer",
  avatarUrl: null,
  bookingUrl: null,
} as unknown as FreelancerProfileResult;

describe("request without an account", () => {
  it("asks a guest for e-mail and company instead of a registration, and says what happens next", () => {
    const html = renderToStaticMarkup(
      createElement(PlacementDialog, {
        profile: PROFILE,
        projectId: "33333333-3333-4333-8333-333333333333",
        introductionsPath: "/api/introductions",
        preview: true,
        guest: true,
        onClose: () => undefined,
      }),
    );
    expect(html).toContain('type="email"');
    expect(html).toContain("Geschäftliche E-Mail");
    expect(html).toContain("Firma");
    expect(html).toContain("So geht es weiter:");
    expect(html).toContain("Ein Konto brauchen Sie dafür nicht.");
    expect(html).toContain('class="placement-trap"');
  });

  it("keeps the dialog short for account users", () => {
    const html = renderToStaticMarkup(
      createElement(PlacementDialog, {
        profile: PROFILE,
        projectId: "33333333-3333-4333-8333-333333333333",
        introductionsPath: "/api/introductions",
        preview: true,
        onClose: () => undefined,
      }),
    );
    expect(html).not.toContain("Geschäftliche E-Mail");
    expect(html).toContain("So geht es weiter:");
  });
});

describe("sidebar and landing page in the placement model", () => {
  it("adds Gespräche to the sidebar only with the placement model", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const on = renderToStaticMarkup(createElement(ChatWorkspace));
    expect(on).toContain('data-sidebar-primary="conversations"');
    expect(on).toContain('href="/gespraeche"');

    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "false");
    expect(renderToStaticMarkup(createElement(ChatWorkspace))).not.toContain('data-sidebar-primary="conversations"');
  });

  it("names request and introduction as the main steps instead of a booking", () => {
    vi.stubEnv("NEXT_PUBLIC_PLACEMENT_REQUESTS_ENABLED", "true");
    const html = renderToStaticMarkup(createElement(FreelancerLanding));
    expect(html).toContain("Einfügen. Anfragen.");
    expect(html).toContain("Nachvollziehbar passende Freelancer.");
    expect(html).toContain(">Freelancer anfragen</strong>");
    expect(html).toContain("Anfrage ohne Konto, Vorstellung kostenlos");
    expect(html).not.toContain("Einfügen. Buchen.");
    expect(html).not.toContain("Termin buchen.</span>");
  });
});
