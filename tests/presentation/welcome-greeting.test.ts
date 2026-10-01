import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  greetingFor,
  greetingName,
  nextKeystroke,
  WELCOME_LEAD,
  WelcomeState,
} from "@/components/chat/welcome";

/** Alle Anschläge von `shown` bis `target`, wie der Browser sie nacheinander ausführt. */
function keystrokes(shown: string, target: string) {
  const steps: { text: string; delayMs: number }[] = [];
  for (let step = nextKeystroke(shown, target); step; step = nextKeystroke(step.text, target)) {
    steps.push(step);
  }
  return steps;
}

describe("welcome greeting", () => {
  // Audit P2: „Recruiter“ als Anrede schloss direkte Auftraggeber aus.
  it("prerenders a plain greeting for guests without a caret, since only the browser knows the time", () => {
    const markup = renderToStaticMarkup(
      createElement(WelcomeState, { displayName: null, ready: true }),
    );

    expect(markup).toContain('<span class="sr-only">Guten Tag</span>');
    expect(markup).not.toContain("Recruiter");
    expect(markup).not.toContain("welcome-caret");
  });

  it("says what to enter and what comes back", () => {
    const markup = renderToStaticMarkup(
      createElement(WelcomeState, { displayName: null, ready: true }),
    );

    expect(markup).toContain(`<p class="welcome-lead">${WELCOME_LEAD}</p>`);
    expect(WELCOME_LEAD).toContain("Projektbeschreibung ein");
    expect(WELCOME_LEAD).toContain("bis zu drei passende Profile");
  });

  it("greets an account by first name", () => {
    const markup = renderToStaticMarkup(
      createElement(WelcomeState, { displayName: "Erika Mustermann", ready: true }),
    );

    expect(markup).toContain('<span class="sr-only">Guten Tag, Erika</span>');
  });

  it.each([
    [4, "Guten Abend"],
    [5, "Guten Morgen"],
    [10, "Guten Morgen"],
    [11, "Guten Tag"],
    [17, "Guten Tag"],
    [18, "Guten Abend"],
    [23, "Guten Abend"],
    [0, "Guten Abend"],
  ])("greets at %i o'clock with %j", (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });

  it.each([
    ["Erika Mustermann", "Erika"],
    ["Mustermann, Erika", "Erika"],
    ["Erika Mustermann, MBA", "Erika"],
    ["Dr. Erika Mustermann", "Erika"],
    ["   ", null],
    [null, null],
  ])("takes the first name from %j", (displayName, expected) => {
    expect(greetingName(displayName)).toBe(expected);
  });

  it("types one character per keystroke and pauses after the comma", () => {
    const target = "Guten Morgen, Erika";
    const steps = keystrokes("", target);

    expect(steps.map((step) => step.text)).toEqual(
      Array.from(target, (_, index) => target.slice(0, index + 1)),
    );
    const letterDelays = steps.slice(1, 7).map((step) => step.delayMs);
    const afterComma = steps.find((step) => step.text === "Guten Morgen, ");
    expect(afterComma?.delayMs).toBeGreaterThan(Math.max(...letterDelays));
  });

  it("keeps typing from the plain greeting when a name arrives", () => {
    const steps = keystrokes("Guten Morgen", "Guten Morgen, Erika");

    expect(steps).toHaveLength(", Erika".length);
    expect(steps.at(-1)?.text).toBe("Guten Morgen, Erika");
  });

  it("deletes back to the shared start when the name changes", () => {
    const steps = keystrokes("Guten Morgen, Max", "Guten Morgen, Erika");

    expect(steps).toHaveLength("Max".length + "Erika".length);
    expect(steps[2]?.text).toBe("Guten Morgen, ");
    expect(steps.at(-1)?.text).toBe("Guten Morgen, Erika");
  });
});
