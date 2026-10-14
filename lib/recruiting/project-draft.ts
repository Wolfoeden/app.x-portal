/**
 * Der noch nicht ausgewertete Projekttext, damit er Registrierung und Checkout
 * übersteht. Nie in Adressen oder bei Stripe.
 *
 * Im `localStorage` statt im `sessionStorage`: Der Bestätigungslink der
 * E-Mail-Anmeldung öffnet einen neuen Tab, und der `sessionStorage` gehört
 * nur dem alten. Bis Oktober 2026 kam der Text deshalb nach der Anmeldung
 * nicht an, und die versprochene Analyse lief nie los. Höchstens 24 Stunden;
 * nach einer erfolgreichen Analyse wird er gelöscht.
 */
export const PROJECT_DRAFT_KEY = "xportal.recruiting-draft.v1";
export const PROJECT_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const PROJECT_DRAFT_MAX_LENGTH = 12_000;

export function saveProjectDraft(text: string): boolean {
  try {
    if (!text.trim()) { clearProjectDraft(); return true; }
    localStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify({
      text: text.slice(0, PROJECT_DRAFT_MAX_LENGTH), savedAt: Date.now(),
    }));
    return true;
  } catch { return false; }
}

export function readProjectDraft(): string | null {
  try {
    const raw = localStorage.getItem(PROJECT_DRAFT_KEY);
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
  try { localStorage.removeItem(PROJECT_DRAFT_KEY); } catch { /* Storage can be disabled. */ }
}
