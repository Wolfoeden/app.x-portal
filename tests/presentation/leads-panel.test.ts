import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

import { LeadsPanel } from "@/app/chat/admin/leads/LeadsPanel";
import type { LeadRow } from "@/lib/leadgen/leads-data";

const BASIS: LeadRow = {
  id: 1,
  recipient_email: "kontakt@example.invalid",
  recipient_name: "Test Person",
  company: "Testfirma GmbH",
  stellenanzeige: "Senior DevOps Engineer — Remote — https://example.invalid/p/1",
  status: "new",
  category: "IT-Consulting",
  notes: null,
  archived_at: null,
  last_contacted_at: null,
  created_at: "2026-09-01T08:00:00.000Z",
  updated_at: "2026-09-01T08:00:00.000Z",
  outreach_id: null,
  outreach_state: null,
  outreach_subject: null,
  outreach_body: null,
  outreach_created_at: null,
  outreach_sent_at: null,
  outreach_failure_reason: null,
  outreach_origin: null,
  outreach_cta_url: null,
  match_status: null,
  match_count: null,
  match_primary_profile_id: null,
  match_open_requirements: null,
  matched_at: null,
};

const MIT_ENTWURF: LeadRow = {
  ...BASIS,
  id: 2,
  outreach_id: "163bdd60-4084-4312-8c20-5efb0258a3ac",
  outreach_state: "draft",
  outreach_subject: "Ein Projekt für Sie",
  outreach_body: "Guten Tag …",
  outreach_created_at: "2026-09-02T08:00:00.000Z",
  outreach_origin: "scheduler",
  match_status: "ranked",
  match_count: 2,
  matched_at: "2026-09-02T07:00:00.000Z",
};

function render(rows: LeadRow[]) {
  return renderToStaticMarkup(
    createElement(LeadsPanel, { rows, categories: [], mailReady: true }),
  );
}

describe("Leadliste bietet nur an, was sie auch verschicken kann", () => {
  it("zählt einen Lead mit Entwurf als auswählbar", () => {
    expect(render([MIT_ENTWURF])).toContain("Alle 1 vorbereiteten auswählen");
  });

  it("blendet den Stapel aus, solange kein Entwurf bereitliegt", () => {
    // Bis zum 9. September war jede unbearbeitete Zeile auswählbar, und der
    // Knopf versprach, die Anschreiben unterwegs zu erzeugen. Die Route dafür
    // war längst zurückgebaut — jeder Klick lief in eine 404.
    const markup = render([BASIS]);
    expect(markup).not.toContain("vorbereiteten auswählen");
    expect(markup).not.toContain("Auswahl verschicken");
    // Auch kein Kästchen an der Zeile selbst.
    expect(markup).not.toContain("type=\"checkbox\"");
  });

  it("nimmt einen bereits angeschriebenen Lead nicht mit auf", () => {
    const angeschrieben: LeadRow = {
      ...MIT_ENTWURF,
      id: 3,
      last_contacted_at: "2026-09-03T09:00:00.000Z",
      outreach_state: "sent",
      outreach_sent_at: "2026-09-03T09:00:00.000Z",
    };
    expect(render([angeschrieben])).not.toContain("vorbereiteten auswählen");
  });
});
