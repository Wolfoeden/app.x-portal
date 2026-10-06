/**
 * Wer das Gespräch führt. Auf der Gesprächsseite und am Ende der Startseite
 * steht ein Mensch mit Namen und Foto statt eines anonymen Formulars
 * (UX-Review Oktober 2026: „Ansprechpartner mit echtem Namen und Foto“).
 *
 * Das Foto ist das aus dem eigenen Freelancer-Profil. Es wird nicht kopiert,
 * sondern über dieselbe Route ausgeliefert wie jedes Profilbild
 * (lib/sales/sales-contact.ts) — ein ausgetauschtes Foto ist damit auch hier
 * sofort das neue.
 *
 * Ohne Serverabhängigkeit, damit die Startseite in Tests ohne Datenbank
 * rendert.
 */
export const SALES_CONTACT = {
  name: "Roman Dering",
  role: "Product Manager",
  /** `freelancer_profiles.id` des Profils mit dem Foto. */
  profileId: "c314d7c4-4428-45ac-ba54-1a657b9f6b62",
} as const;

export function contactInitials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
