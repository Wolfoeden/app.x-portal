import { describe, expect, it } from "vitest";

import { resultScroll, type ResultScrollInput } from "@/components/chat/result-scroll";

const input = (overrides: Partial<ResultScrollInput> = {}): ResultScrollInput => ({
  pending: false,
  hasResult: true,
  resultKey: "ranked|a,b,c",
  messages: 2,
  sectionShown: true,
  ...overrides,
});

// Audit F08: Nach dem Matching stand das letzte Profil im Bild, Überschrift
// und Hauptvorschlag lagen darüber.
describe("where the chat scrolls after a change", () => {
  it("brings a new result's heading into view instead of the end of the list", () => {
    expect(resultScroll(null, input())).toEqual({ target: "result", shown: { key: "ranked|a,b,c", messages: 2 } });
  });

  it("follows the end while an answer is loading and forgets the last result", () => {
    expect(resultScroll({ key: "ranked|a,b,c", messages: 2 }, input({ pending: true }))).toEqual({ target: "end", shown: null });
  });

  it("brings the heading into view again after a new search, even with the same profiles", () => {
    const afterPending = resultScroll({ key: "ranked|a,b,c", messages: 2 }, input({ pending: true })).shown;
    expect(resultScroll(afterPending, input({ messages: 4 })).target).toBe("result");
  });

  it("leaves the view alone when the same result is set again", () => {
    const shown = { key: "ranked|a,b,c", messages: 2 };
    expect(resultScroll(shown, input())).toEqual({ target: "none", shown });
  });

  it("follows a new message below an unchanged result", () => {
    const shown = { key: "ranked|a,b,c", messages: 2 };
    expect(resultScroll(shown, input({ messages: 3 })).target).toBe("end");
  });

  it("waits until the result section is on the page before counting it as shown", () => {
    const loading = resultScroll(null, input({ sectionShown: false }));
    expect(loading).toEqual({ target: "end", shown: null });
    expect(resultScroll(loading.shown, input()).target).toBe("result");
  });

  it("follows the end of a conversation without a result", () => {
    expect(resultScroll(null, input({ hasResult: false })).target).toBe("end");
  });
});
