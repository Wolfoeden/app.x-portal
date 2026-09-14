import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TERMS_EFFECTIVE_DATE, TERMS_REVIEW, TERMS_STATUS } from "@/lib/legal/policy";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Paket 4: Konsolidierung und Freigabe", () => {
  it("extrahiert Sidebar, Einstieg und Nutzungsdarstellung aus ChatWorkspace", () => {
    const workspace = source("components/ChatWorkspace.tsx");
    expect(workspace).toContain('from "./chat/sidebar-chat-list"');
    expect(workspace).toContain('from "./chat/usage-presentation"');
    expect(workspace).toContain('from "./chat/welcome"');
  });

  it("entfernt Erklaerblock und Gast-Creditzeile aus dem leeren Chat", () => {
    const workspace = source("components/ChatWorkspace.tsx");
    const welcome = source("components/chat/welcome.tsx");
    const visibleChat = `${workspace}\n${welcome}`;
    expect(visibleChat).not.toContain("Das passiert nach dem Absenden");
    expect(visibleChat).not.toContain("Gast-Credits");
    expect(visibleChat).not.toContain("KI strukturiert den Text. Das Matching bleibt regelbasiert.");
  });

  it("haelt die Sidebar frei von Datum und Workflow-Etiketten", () => {
    const sidebar = source("components/chat/sidebar-chat-list.tsx");
    expect(sidebar).not.toMatch(/Heute|Gestern|Letzte 7 Tage|Früher/u);
    expect(sidebar).not.toMatch(/Abgleich|Auswahl|Kontakt/u);
    expect(sidebar).not.toContain("updatedAt");
    expect(sidebar).not.toContain("chat.status");
  });

  it("reduziert den Zahlungsdialog auf Kontostand, Angebot und Buchung", () => {
    const account = source("components/chat/account.tsx");
    expect(account).not.toContain("Was eine bestätigte Aktion kostet");
    expect(account).not.toContain("Aktueller Stand. Klare nächste Option.");
    expect(account).not.toContain("Setzen Sie zuerst das Häkchen");
    expect(account).not.toContain("Fragen zur Abrechnung oder eine Obergrenze vereinbaren");
    expect(account).toContain("Plan buchen");
  });

  it("veroeffentlicht den freigegebenen AGB-Stand", () => {
    expect(TERMS_STATUS).toBe("approved");
    expect(TERMS_REVIEW.checkoutEnabled).toBe(true);
    expect(TERMS_REVIEW.label).toBe("Rechtlich geprüft");
    expect(TERMS_EFFECTIVE_DATE).toBe("14. September 2026");
  });
});
