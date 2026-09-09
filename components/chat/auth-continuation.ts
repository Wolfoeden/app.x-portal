export type AuthIntent =
  | "generic"
  | "save_profile"
  | "contact_profile"
  | "book_profile"
  | "save_search"
  | "external_research";

export type AuthContinuation = {
  version: 1;
  intent: AuthIntent;
  projectId: string | null;
  profileId: string | null;
  createdAt: number;
};

const STORAGE_KEY = "xportal.auth-continuation.v1";
const MAX_AGE_MS = 60 * 60 * 1_000;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/u;
const INTENTS = new Set<AuthIntent>([
  "generic",
  "save_profile",
  "contact_profile",
  "book_profile",
  "save_search",
  "external_research",
]);

function safeId(value: unknown): string | null {
  return typeof value === "string" && SAFE_ID.test(value) ? value : null;
}

export function createAuthContinuation(
  intent: AuthIntent,
  projectId?: string | null,
  profileId?: string | null,
): AuthContinuation {
  return {
    version: 1,
    intent,
    projectId: safeId(projectId),
    profileId: safeId(profileId),
    createdAt: Date.now(),
  };
}

export function parseAuthContinuation(
  value: unknown,
  now = Date.now(),
): AuthContinuation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.intent !== "string" ||
    !INTENTS.has(candidate.intent as AuthIntent) ||
    typeof candidate.createdAt !== "number" ||
    now - candidate.createdAt < 0 ||
    now - candidate.createdAt > MAX_AGE_MS
  ) {
    return null;
  }
  const projectId = safeId(candidate.projectId);
  const profileId = safeId(candidate.profileId);
  if (candidate.projectId !== null && projectId === null) return null;
  if (candidate.profileId !== null && profileId === null) return null;
  return {
    version: 1,
    intent: candidate.intent as AuthIntent,
    projectId,
    profileId,
    createdAt: candidate.createdAt,
  };
}

export function continuationPath(continuation: AuthContinuation): string {
  const params = new URLSearchParams({ resume: continuation.intent });
  if (continuation.projectId) params.set("project", continuation.projectId);
  if (continuation.profileId) params.set("profile", continuation.profileId);
  return `/chat?${params.toString()}`;
}

export function storeAuthContinuation(continuation: AuthContinuation) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(continuation));
}

export function readAuthContinuation(): AuthContinuation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseAuthContinuation(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearAuthContinuation() {
  localStorage.removeItem(STORAGE_KEY);
}

export function continuationFromSearch(
  search: string,
): AuthContinuation | null {
  const params = new URLSearchParams(search);
  const intent = params.get("resume");
  if (!intent || !INTENTS.has(intent as AuthIntent)) return null;
  return createAuthContinuation(
    intent as AuthIntent,
    params.get("project"),
    params.get("profile"),
  );
}

export function authIntentCopy(intent: AuthIntent) {
  switch (intent) {
    case "save_profile":
      return {
        eyebrow: "Profil merken",
        title: "Auswahl mit einem Konto sichern",
        body: "Ihre Anfrage und das gewählte Profil bleiben erhalten. Nach der Anmeldung wird das Profil Ihrer Merkliste hinzugefügt.",
      };
    case "contact_profile":
      return {
        eyebrow: "Kontakt fortsetzen",
        title: "Konto erstellen und Profil kontaktieren",
        body: "Ihre Anfrage und das gewählte Profil bleiben erhalten. Danach öffnen wir den Kontaktweg – eine Nachricht wird nicht automatisch versendet.",
      };
    case "book_profile":
      return {
        eyebrow: "Termin fortsetzen",
        title: "Konto erstellen und Terminweg öffnen",
        body: "Ihre Anfrage und das gewählte Profil bleiben erhalten. Danach öffnen wir den Terminweg – es wird nichts automatisch gebucht.",
      };
    case "save_search":
      return {
        eyebrow: "Suche sichern",
        title: "Suche mit einem Konto speichern",
        body: "Der Projektabgleich bleibt erhalten und steht Ihnen nach der Anmeldung dauerhaft zur Verfügung.",
      };
    case "external_research":
      return {
        eyebrow: "Externe Recherche",
        title: "Konto erstellen und Recherche vorbereiten",
        body: "Ihre Anfrage bleibt erhalten. Die Recherche kostet 30 Credits und startet erst, wenn Sie sie nach der Anmeldung ausdrücklich bestätigen.",
      };
    default:
      return {
        eyebrow: "Arbeit sichern",
        title: "Konto erstellen und direkt fortfahren",
        body: "Ihre Anfrage bleibt erhalten und wird nach der Anmeldung wieder geöffnet.",
      };
  }
}
