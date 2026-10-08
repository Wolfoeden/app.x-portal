import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Am 08.10.2026 lud /chat den Arbeitsbereich in einer Endlosschleife:
// loadProject hing an auth.user, jede Anmeldeprüfung erzeugte ein neues
// Objekt, damit eine neue loadProject-Funktion und einen neuen Lauf des
// Start-Effekts. Das Anmeldefenster für den Trial erschien nie.
const source = readFileSync("components/ChatWorkspace.tsx", "utf8").replace(/\r\n/g, "\n");

function dependencies(name: string): string[] {
  const start = source.indexOf(`const ${name} = useCallback(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  );\n", start);
  const body = source.slice(start, end);
  const list = body.slice(body.lastIndexOf("[") + 1, body.lastIndexOf("]"));
  return list.split(",").map((entry) => entry.trim()).filter(Boolean);
}

describe("workspace bootstrap", () => {
  it("keeps loadProject independent of the changing auth view", () => {
    const deps = dependencies("loadProject");
    expect(deps).toEqual(["applyProjectDetail", "fetchProjectDetail", "showToast"]);
    for (const dep of deps) expect(dep).not.toMatch(/auth|isAccountUser|draft/u);
  });
});
