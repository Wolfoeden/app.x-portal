/**
 * Die visuelle Identität einer Profilkarte: ein Monogramm in einer festen
 * Farbe je Name und ein Titelband in der Farbe des Fachgebiets.
 *
 * Von 70 Profilen hat eines ein Foto. Ohne eigene Farbe sah jede Karte gleich
 * aus — schwarzer Kreis, Initialen, Text. Die Farbe trägt keine Bedeutung,
 * sie macht Karten nur unterscheidbar und wiedererkennbar; das Fachgebiet
 * sagt auf einen Blick, in welcher Ecke jemand arbeitet.
 *
 * Klein und ohne Abhängigkeiten, damit es auch im Browser rechnet (Vorschau
 * im Bewerbungsformular). Das Fachgebiet selbst bestimmt der Server
 * (`lib/profile/field.ts`), damit die Rollen-Taxonomie nicht im Bundle landet.
 */

export const PROFILE_FIELDS = [
  "ai",
  "data",
  "frontend",
  "software",
  "cloud",
  "sap",
  "requirements",
  "business",
  "other",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const PROFILE_FIELD_LABELS: Readonly<Record<ProfileField, string>> = {
  ai: "KI & Agenten",
  data: "Daten & Analytics",
  frontend: "Frontend & UX",
  software: "Softwareentwicklung",
  cloud: "Cloud & Sicherheit",
  sap: "SAP",
  requirements: "Anforderungen & Projekte",
  business: "Marketing & Vertrieb",
  other: "IT & Beratung",
};

export const MONOGRAM_TONES = 10;

/** Fest je Name (FNV-1a), unabhängig von Groß-/Kleinschreibung und Leerraum. */
export function monogramTone(name: string): number {
  const text = name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % MONOGRAM_TONES;
}

export function isProfileField(value: unknown): value is ProfileField {
  return typeof value === "string" && (PROFILE_FIELDS as readonly string[]).includes(value);
}
