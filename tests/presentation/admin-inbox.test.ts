import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InboxPanel } from "@/app/chat/admin/inbox/InboxPanel";
import { adminInboxPreview } from "@/components/admin/inbox-preview-fixtures";

describe("admin inbox presentation", () => {
  it("renders a safe local work queue with distinct sources and next actions", () => {
    const markup = renderToStaticMarkup(
      createElement(InboxPanel, {
        initialSnapshot: adminInboxPreview,
        previewMode: true,
      }),
    );

    expect(markup).toContain('data-preview-mode="true"');
    expect(markup).toContain("Lokale Testdaten");
    expect(markup).toContain('data-kind="contact"');
    expect(markup).toContain('data-kind="introduction"');
    expect(markup).toContain("Als beantwortet markieren");
    expect(markup).toContain("Zur Buchung freigeben");
    expect(markup).toContain("Termin bestätigen");
    expect(markup).toContain("Gespräch abschließen");
    expect(markup).toContain("example.invalid");
    expect(markup).not.toContain("roman@dering.info");
  });

  it("has a useful empty state instead of a blank panel", () => {
    const markup = renderToStaticMarkup(
      createElement(InboxPanel, {
        initialSnapshot: {
          ...adminInboxPreview,
          contacts: [],
          introductions: [],
        },
        previewMode: true,
      }),
    );

    expect(markup).toContain("Keine Vorgänge in dieser Ansicht.");
    expect(markup).toContain("Sobald ein neuer Vorgang eingeht");
  });
});
