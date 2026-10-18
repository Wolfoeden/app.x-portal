/**
 * Wer das Gespräch führt. Auf der Gesprächsseite und am Ende der Startseite
 * steht ein Mensch mit Namen und Foto statt eines anonymen Formulars
 * (UX-Review Oktober 2026: „Ansprechpartner mit echtem Namen und Foto“).
 *
 * Das Foto ist das aus dem eigenen Freelancer-Profil, als Kopie in
 * public/images (siehe `photo`).
 *
 * Ohne Serverabhängigkeit, damit die Startseite in Tests ohne Datenbank
 * rendert.
 */
export const SALES_CONTACT = {
  name: "Roman Dering",
  role: "Produktmanager",
  /** `freelancer_profiles.id` des eigenen Freelancer-Profils. */
  profileId: "c314d7c4-4428-45ac-ba54-1a657b9f6b62",
  /**
   * Das Foto als statische Datei (seit 18.10.2026). Vorher kam es über die
   * Profilbild-Route: Server-Funktion, Datenbank, signierte Supabase-URL,
   * Weiterleitung — im Median 5 Sekunden, nicht cachebar. `small` ist auf
   * das Gesicht zugeschnitten (160 px, für Avatare bis 80 px), `large` das
   * ganze Bild (400 px). Neues Foto: beide Dateien in public/images ersetzen.
   */
  photo: { small: "/images/roman-dering-160.webp", large: "/images/roman-dering-400.webp" },
  /** Steht auf der Kontaktseite; vom Inhaber für die Seite freigegeben. */
  phone: "+49 175 8934338",
  /**
   * Der eigene Kalender für das Erstgespräch. `SALES_CALL_URL` übersteuert
   * ihn (lib/sales/sales-call.ts), ist sie nicht gesetzt, gilt dieser.
   */
  calendarUrl: "https://calendly.com/romandering/30min",
} as const;

/** Die Nummer für `tel:`-Links: nur „+“ und Ziffern. */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/gu, "")}`;
}

export function contactInitials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
