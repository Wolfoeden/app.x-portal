import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TERMS_EFFECTIVE_DATE,
  TERMS_REVIEW,
  TERMS_STATUS,
  TERMS_VERSION,
} from "@/lib/legal/policy";

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
    expect(welcome).toContain("Projekt einfügen. Profil buchen.");
    expect(welcome).not.toContain("assistant-emblem");
    expect(welcome).not.toContain("1st & 2nd Level Support");
    expect(welcome).not.toContain("description:");
    expect(welcome).not.toContain("suggestion-arrow");
  });

  it("haelt die Sidebar frei von Datum und Workflow-Etiketten", () => {
    const sidebar = source("components/chat/sidebar-chat-list.tsx");
    expect(sidebar).not.toMatch(/Heute|Gestern|Letzte 7 Tage|Früher/u);
    expect(sidebar).not.toMatch(/Abgleich|Auswahl|Kontakt/u);
    expect(sidebar).not.toContain("updatedAt");
    expect(sidebar).not.toContain("chat.status");
  });

  it("haelt den Zahlungsdialog frei von einer zweiten Preisliste", () => {
    const account = source("components/chat/account.tsx");
    expect(account).not.toContain("Was eine bestätigte Aktion kostet");
    expect(account).not.toContain("Aktueller Stand. Klare nächste Option.");
    expect(account).not.toContain("Setzen Sie zuerst das Häkchen");
    expect(account).not.toContain("Fragen zur Abrechnung oder eine Obergrenze vereinbaren");
    expect(account).toContain('href="/preise"');
    expect(account).toContain("Tarife ansehen und Credits kaufen");
    expect(account).not.toContain("fixedPlanCheckout");
    expect(account).not.toContain("businessConfirmed");
  });

  it("startet die Stripe-Weiterleitung mit echten Links auf der Preisseite", () => {
    const pricing = source("app/(marketing)/preise/page.tsx");
    expect(pricing).toContain('const href = `/api/billing/checkout?plan=${plan.id}`');
    expect(pricing).toContain('<a className={styles.cardAction} href={href}>');
    expect(pricing).not.toContain('<Link className={styles.cardAction} href={href}');
  });

  it("oeffnet vom Profil aus direkt die zentrale Preisseite", () => {
    const workspace = source("components/ChatWorkspace.tsx");
    const account = source("components/chat/account.tsx");

    expect(account).toContain("Abrechnung und Team");
    expect(workspace).toContain(
      'new URL("/preise", window.location.origin).toString()',
    );
  });

  it("veroeffentlicht den freigegebenen AGB-Stand", () => {
    expect(TERMS_STATUS).toBe("approved");
    expect(TERMS_REVIEW.checkoutEnabled).toBe(true);
    expect(TERMS_REVIEW.label).toBe("Rechtlich geprüft");
    expect(TERMS_VERSION).toBe("1.1");
    expect(TERMS_EFFECTIVE_DATE).toBe("17. September 2026");
  });
});
