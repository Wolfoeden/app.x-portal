/**
 * Vom freelancermap-Profil zum Kandidaten, den XPORTAL schon verarbeiten kann.
 *
 * Die Übernahme in `lib/freelancer/sourced-candidate-import.ts`, der
 * Einladungstext in `lib/freelancer/outreach.ts` und die Fristenliste unter
 * `/chat/admin/outreach` arbeiten alle auf `ExternalFreelancerCandidate`.
 * Diese Form hier zu treffen heißt: Die neue Quelle hängt sich an eine fertige
 * Kette, statt eine zweite daneben zu bauen.
 *
 * Was die Quelle nicht hergibt, bleibt leer. Insbesondere `contactEmail`:
 * freelancermap veröffentlicht keine Adressen, der Kontakt läuft dort über ein
 * eigenes Formular. Eine Adresse aus Name und Firma zusammenzusetzen wäre die
 * naheliegende und die schlechteste Lösung — sie erreichte einen Fremden.
 */

import type { ExternalFreelancerCandidate } from "@/lib/openai/external-freelancer-search";

import type { FreelancermapProfile } from "./freelancermap";

/** Untergrenze der Spalte `experience_summary`. */
const SUMMARY_MIN_LENGTH = 40;

/**
 * Der Beschreibungstext.
 *
 * Erst die Selbstbeschreibung, dann Rolle und Skills als Auffüllung. Alles
 * davon steht so auf dem Profil; erfunden wird nichts. Reicht es zusammen
 * nicht auf die geforderten vierzig Zeichen, gibt es keinen Kandidaten —
 * lieber keiner als einer mit erfundenem Text, denn der Text steht später in
 * der Ansprache.
 */
export function candidateSummary(profile: FreelancermapProfile): string | null {
  const teile = [
    profile.about?.trim(),
    profile.role?.trim(),
    profile.skills.length ? `Kompetenzen: ${profile.skills.slice(0, 12).join(", ")}` : null,
  ].filter((wert): wert is string => Boolean(wert));

  const text = teile.join(" · ").slice(0, 2_000).trim();
  return text.length >= SUMMARY_MIN_LENGTH ? text : null;
}

/**
 * Was die Person laut Profil tut. Aus Ort, Satz und Sprachen — Angaben, die
 * sie selbst veröffentlicht hat und die im Katalog später Pflichtfelder sind.
 */
function activities(profile: FreelancermapProfile): string[] {
  const raus: string[] = [];
  if (profile.location) {
    raus.push(`Standort ${profile.location}${profile.countryCode ? `, ${profile.countryCode}` : ""}`);
  }
  if (profile.hourlyRate) {
    raus.push(`Stundensatz ${profile.hourlyRate.amount} ${profile.hourlyRate.currency}`);
  }
  for (const sprache of profile.languages.slice(0, 6)) raus.push(`Sprache ${sprache}`);
  return raus;
}

/**
 * Ein Kandidat aus einem Profil — oder null, wenn das Profil die Mindestangaben
 * nicht hergibt.
 */
export function candidateFromProfile(
  profile: FreelancermapProfile,
): ExternalFreelancerCandidate | null {
  const summary = candidateSummary(profile);
  if (!profile.displayName || !profile.role || !summary) return null;

  return {
    displayName: profile.displayName.slice(0, 160),
    role: profile.role.slice(0, 200),
    summary: summary.slice(0, 800),
    // Der Abgleich mit einer Ausschreibung hat nicht stattgefunden. Etwas
    // anderes zu behaupten hieße, dem Auftraggeber eine Prüfung zu verkaufen,
    // die es nicht gab.
    matchedRequirements: [],
    knownGaps: [],
    profileUrl: profile.profileUrl,
    // Kein öffentlicher Kalender, keine eigene Seite, kein Netzwerkprofil:
    // Das Portal verlinkt nichts davon, und geraten wird nicht.
    bookingUrl: null,
    linkedinUrl: null,
    websiteUrl: null,
    portfolioUrl: null,
    contactEmail: null,
    skills: profile.skills.slice(0, 24),
    activities: activities(profile).slice(0, 12),
    projects: [],
    sourceUrls: [profile.profileUrl],
    verificationStatus: "external_unverified",
    // Der Name steht in der Profiladresse, wenn sie aus ihm gebildet wurde.
    // Sonst stammt er allein aus der Seite — das ist bei freelancermap
    // trotzdem eine Selbstauskunft, aber eine schwächer belegte.
    nameVerified: profileUrlCarriesName(profile.profileUrl, profile.displayName),
  };
}

/** Trägt die Profiladresse den Namen der Person? */
export function profileUrlCarriesName(
  profileUrl: string,
  displayName: string,
): boolean {
  const pfad = profileUrl.toLowerCase();
  const teile = displayName
    .toLocaleLowerCase("de-DE")
    .replace(/ß/gu, "ss")
    .replace(/[äÄ]/gu, "ae")
    .replace(/[öÖ]/gu, "oe")
    .replace(/[üÜ]/gu, "ue")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/\s+/u)
    .filter((wert) => wert.length >= 3);
  if (teile.length === 0) return false;
  // Der Nachname genügt nicht allein — „schmidt" trifft zu viele Adressen.
  // Erst wenn Vor- und Nachname im Pfad stehen, ist die Bindung belegt.
  return teile.every((teil) => pfad.includes(teil));
}
