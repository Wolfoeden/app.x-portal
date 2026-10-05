import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("components/ChatWorkspace.tsx", "utf8");
const css = readFileSync("app/styles/workspace.css", "utf8");

/** Der CSS-Block eines Selektors, ohne Media Queries auseinanderzunehmen. */
function blocks(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]*)\\}`, "gu"))].map((match) => match[1]!);
}

// Oktober 2026: Die Hinweiszeile unter dem Eingabefeld steht im leeren Chat
// und im Gespräch an derselben Stelle; das Feld ist zu Beginn mittig und groß.
describe("chat composer layout", () => {
  it("renders the disclosure after the composer zone, not inside it", () => {
    const zoneStart = workspace.indexOf('<div className="composer-zone">');
    const disclosure = workspace.indexOf('<p className="composer-disclosure">');
    expect(zoneStart).toBeGreaterThan(-1);
    expect(disclosure).toBeGreaterThan(zoneStart);
    const between = workspace.slice(zoneStart, disclosure);
    const opened = between.match(/<div\b/gu)?.length ?? 0;
    const closed = between.match(/<\/div>/gu)?.length ?? 0;
    // Alle bis dahin geöffneten divs sind wieder zu: Die Zeile ist ein
    // Geschwister der Eingabezone.
    expect(closed).toBeGreaterThanOrEqual(opened);
  });

  it("keeps the legal links and the price, without the data-flow link", () => {
    const line = workspace.slice(workspace.indexOf('<p className="composer-disclosure">'));
    const end = line.indexOf("</p>");
    const disclosure = line.slice(0, end);
    expect(disclosure).toContain("Eine Projektanalyse kostet");
    for (const href of ["/imprint", "/privacy", "/terms", "/contact"]) expect(disclosure).toContain(`href="${href}"`);
    expect(disclosure).not.toContain("datenwege");
  });

  it("gives the disclosure its own grid row instead of absolute positioning", () => {
    expect(blocks(".chat-panel")[0]).toContain("minmax(0, 1fr) auto auto");
    for (const block of blocks(".chat-panel.is-empty-chat .composer-disclosure")) {
      expect(block).not.toContain("position: absolute");
    }
    expect(blocks(".chat-panel.is-empty-chat .composer-disclosure")[0]).toContain("grid-row: 5");
  });

  it("makes the field larger only while the chat is empty", () => {
    expect(blocks(".chat-panel.is-empty-chat .composer textarea")[0]).toContain("min-height: 112px");
    expect(blocks(".composer textarea")[0]).toContain("min-height: 50px");
    expect(workspace).toContain("}, [draft, largeComposer]);");
  });
});
