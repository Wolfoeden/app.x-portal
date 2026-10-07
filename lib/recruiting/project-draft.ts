/** Necessary, tab-local continuity. Never put recruiting text in URLs or Stripe. */
export const PROJECT_DRAFT_KEY = "xportal.recruiting-draft.v1";
export const PROJECT_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PROJECT_DRAFT_MAX_LENGTH = 12_000;

export function saveProjectDraft(text: string): boolean {
  try {
    if (!text.trim()) { clearProjectDraft(); return true; }
    sessionStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify({
      text: text.slice(0, PROJECT_DRAFT_MAX_LENGTH), savedAt: Date.now(),
    }));
    return true;
  } catch { return false; }
}

export function readProjectDraft(): string | null {
  try {
    const raw = sessionStorage.getItem(PROJECT_DRAFT_KEY);
    if (!raw) return null;
    const draft: unknown = JSON.parse(raw);
    if (!draft || typeof draft !== "object") throw new Error("invalid_draft");
    const { text, savedAt } = draft as { text?: unknown; savedAt?: unknown };
    const age = typeof savedAt === "number" ? Date.now() - savedAt : -1;
    if (typeof text !== "string" || !text.trim() || age < 0 || age > PROJECT_DRAFT_MAX_AGE_MS) {
      clearProjectDraft(); return null;
    }
    return text.slice(0, PROJECT_DRAFT_MAX_LENGTH);
  } catch { clearProjectDraft(); return null; }
}

export function clearProjectDraft(): void {
  try { sessionStorage.removeItem(PROJECT_DRAFT_KEY); } catch { /* Storage can be disabled. */ }
}
