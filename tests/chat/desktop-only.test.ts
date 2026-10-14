import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ChatPage from "@/app/chat/page";
import { DESKTOP_LINK_MAIL, DesktopOnlyNotice } from "@/components/chat/desktop-only";

// Oktober 2026: Der Talent Index ist für den Zweitbildschirm im Büro gebaut.
// Auf dem Handy steht davor ein Hinweis statt eines gequetschten Chats.
describe("talent index on a phone", () => {
  const markup = renderToStaticMarkup(createElement(DesktopOnlyNotice));

  it("says it is desktop-only and offers the way to a computer", () => {
    expect(markup).toContain("Der Talent Index ist derzeit nur für den Desktop.");
    expect(markup).toContain("x-portal.eu/chat</strong> am Computer");
    expect(markup).toContain("Link per E-Mail senden");
    expect(markup).toContain('href="/fuer-unternehmen"');
    expect(markup).toContain("Trotzdem hier öffnen");
    // Der Hauptknopf öffnet den Talent Index hier, nicht der Link per E-Mail.
    expect(markup.indexOf("Trotzdem hier öffnen")).toBeLessThan(markup.indexOf("Link per E-Mail senden"));
    expect(markup).toContain('href="/imprint"');
  });

  it("mails the chat link without a recipient", () => {
    expect(DESKTOP_LINK_MAIL.startsWith("mailto:?subject=")).toBe(true);
    expect(decodeURIComponent(DESKTOP_LINK_MAIL)).toMatch(/Am Computer öffnen: https?:\/\/\S+\/chat$/u);
  });

  it("stands before the workspace, hidden on desktop by CSS alone", () => {
    const page = ChatPage();
    const children = (page.props as { children: { type: unknown }[] }).children;
    expect(children[0].type).toBe(DesktopOnlyNotice);

    const css = readFileSync("components/chat/desktop-only.module.css", "utf8");
    expect(css).toMatch(/^\.notice \{ display: none; \}$/mu);
    expect(css).toContain("@media (max-width: 860px), (max-height: 500px) and (pointer: coarse)");
    expect(css).toContain(".notice ~ :global(.app-shell) { display: none; }");
  });
});
