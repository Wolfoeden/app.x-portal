import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { previewProfiles } from "@/components/chat/preview-fixtures";
import { PublicProfileCard } from "@/components/profile/PublicProfileCard";
import type { ProfilePageAction } from "@/lib/profile/profile-link";

const profile = {
  ...previewProfiles[0],
  id: "11111111-1111-4111-8111-111111111111",
  skillTags: ["React", "TypeScript", "Next.js", "Design Systems", "SaaS", "Testing", "GraphQL", "AWS"],
};

const booking: ProfilePageAction = {
  kind: "booking",
  href: `/api/freelancers/${profile.id}/book`,
  label: "Erstgespräch vereinbaren",
  hint: "Kostenloses Erstgespräch · Sie wählen den Termin selbst",
};

function render(action: ProfilePageAction = booking, expandedByDefault = false) {
  return renderToStaticMarkup(
    createElement(PublicProfileCard, {
      profile,
      action,
      shareUrl: `https://x-portal.eu/profil/${profile.id}?via=share`,
      expandedByDefault,
    }),
  );
}

describe("profile card on its own page", () => {
  it("shows the short card: who, what, key facts, six skills and the rest counted", () => {
    const markup = render();

    expect(markup).toContain("Anna Keller");
    expect(markup).toContain("Senior Frontend Engineer");
    expect(markup).toContain("950 € / Tag");
    expect(markup).toContain("Testing");
    expect(markup).not.toContain("GraphQL");
    expect(markup).toContain("+2 weitere");
    expect(markup).toContain("Referenzen geprüft");
  });

  // Die Karte ist gekürzt: Belege und Details stehen erst im aufgeklappten Profil.
  it("keeps evidence and details behind the full profile", () => {
    const short = render();
    const full = render(booking, true);

    expect(short).not.toContain("Von XPORTAL geprüft");
    expect(short).toContain("Vollständiges Profil");
    expect(full).toContain("Von XPORTAL geprüft");
    expect(full).toContain("React-Projekterfahrung durch Referenzen belegt");
    expect(full).toContain("GraphQL");
    expect(full).toContain("Profil einklappen");
  });

  it("links to the calendar, or to the request, depending on the model", () => {
    expect(render()).toContain(`href="/api/freelancers/${profile.id}/book"`);

    const request = render({
      kind: "link",
      href: "/chat",
      label: "Projekt beschreiben und anfragen",
      hint: "Kostenlos bis zur Beauftragung · Die Anfrage läuft über Ihr Projekt",
    });
    expect(request).toContain("Projekt beschreiben und anfragen");
    expect(request).not.toContain("/book");
  });

  it("offers the link to pass on", () => {
    expect(render()).toContain("Link kopieren");
  });
});
