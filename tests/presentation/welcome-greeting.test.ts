import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  greetingFor,
  greetingName,
  nextKeystroke,
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
  it("prerenders the recruiter greeting without a caret, since only the browser knows the time", () => {
    const markup = renderToStaticMarkup(
      createElement(WelcomeState, { displayName: null, ready: true }),
    );

    expect(markup).toContain('<span class="sr-only">Schönen Guten Tag, Recruiter</span>');
    expect(markup).not.toContain("welcome-caret");
  });

  it("greets an account by first name", () => {
    const markup = renderToStaticMarkup(
      createElement(WelcomeState, { displayName: "Erika Mustermann", ready: true }),
    );

    expect(markup).toContain('<span class="sr-only">Schönen Guten Tag, Erika</span>');
  });

  it.each([
    [4, "Schönen Guten Abend"],
    [5, "Schönen Guten Morgen"],
    [10, "Schönen Guten Morgen"],
    [11, "Schönen Guten Tag"],
    [17, "Schönen Guten Tag"],
    [18, "Schönen Guten Abend"],
    [23, "Schönen Guten Abend"],
    [0, "Schönen Guten Abend"],
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
    const target = "Schönen Guten Morgen, Erika";
    const steps = keystrokes("", target);

    expect(steps.map((step) => step.text)).toEqual(
      Array.from(target, (_, index) => target.slice(0, index + 1)),
    );
    const letterDelays = steps.slice(1, 7).map((step) => step.delayMs);
    const afterComma = steps.find((step) => step.text === "Schönen Guten Morgen, ");
    expect(afterComma?.delayMs).toBeGreaterThan(Math.max(...letterDelays));
  });

  it("deletes back to the shared start when the name replaces the fallback", () => {
    const steps = keystrokes("Schönen Guten Morgen, Recruiter", "Schönen Guten Morgen, Erika");

    expect(steps).toHaveLength("Recruiter".length + "Erika".length);
    expect(steps[8]?.text).toBe("Schönen Guten Morgen, ");
    expect(steps.at(-1)?.text).toBe("Schönen Guten Morgen, Erika");
  });
});
