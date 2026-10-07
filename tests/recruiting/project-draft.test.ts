import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProjectDraft, PROJECT_DRAFT_KEY, PROJECT_DRAFT_MAX_AGE_MS, readProjectDraft, saveProjectDraft } from "@/lib/recruiting/project-draft";
const values = new Map<string,string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("sessionStorage", {getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => values.set(key,value), removeItem:(key:string) => values.delete(key)});
});
afterEach(() => vi.unstubAllGlobals());
describe("project continuity", () => {
  it("retains exact text across registration and checkout without consuming it on read", () => {
    const text = "React-Entwickler\nNur vorhandene Profile. Keine Kontaktaufnahme.";
    expect(saveProjectDraft(text)).toBe(true);
    expect(readProjectDraft()).toBe(text);
    expect(readProjectDraft()).toBe(text);
    clearProjectDraft(); expect(readProjectDraft()).toBeNull();
  });
  it("rejects stale, malformed and future-dated drafts", () => {
    for (const value of ["invalid", JSON.stringify({text:"old",savedAt:Date.now()-PROJECT_DRAFT_MAX_AGE_MS-1}), JSON.stringify({text:"future",savedAt:Date.now()+10000})]) {
      values.set(PROJECT_DRAFT_KEY,value); expect(readProjectDraft()).toBeNull();
    }
  });
  it("surfaces unavailable storage to the caller", () => {
    vi.stubGlobal("sessionStorage", {setItem: () => {throw new Error("disabled");}, getItem: () => null, removeItem: () => {throw new Error("disabled");}});
    expect(saveProjectDraft("important draft")).toBe(false);
    expect(readProjectDraft()).toBeNull();
  });
});
