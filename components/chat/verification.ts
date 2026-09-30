/**
 * Was die Prüfkennzeichnungen am Profil bedeuten (Audit F07).
 *
 * Geprüfte Angaben, Selbstauskünfte und der Referenzstatus standen
 * nebeneinander, ohne dass jemand sehen konnte, was geprüft wurde. Der
 * Referenzstatus sagte „Verifiziert“ bzw. „Referenzen geprüft“ auch dann,
 * wenn nur die Profilprüfung abgeschlossen war (`operator_verified`, siehe
 * lib/data/freelancers.ts). Die Texte hier folgen dem Ablauf in
 * docs/operator-runbook.md: Eine Angabe wird „geprüft“, wenn XPORTAL sie
 * einzeln mit einem Nachweis abgleicht; alles andere bleibt Angabe des
 * Freelancers. Eine Kompetenzprüfung ist das nicht.
 */

export const VERIFICATION_HELP: ReadonlyArray<{ term: string; text: string }> = [
  {
    term: "Von XPORTAL geprüft",
    text: "XPORTAL hat diese Angabe einzeln mit einem Nachweis abgeglichen, etwa Lebenslauf, Zertifikat oder öffentlichem Berufsprofil. Geprüft ist, dass die Angabe belegt ist, nicht wie gut jemand arbeitet.",
  },
  {
    term: "Vom Freelancer angegeben",
    text: "So vom Freelancer angegeben oder aus öffentlichen beruflichen Quellen übernommen. XPORTAL hat diese Angabe nicht einzeln geprüft.",
  },
  {
    term: "Profilprüfung",
    text: "Ob XPORTAL das Profil bei der Aufnahme geprüft hat. Welche Angaben dabei belegt wurden, steht unter „Von XPORTAL geprüft“; ein Datum je Angabe zeigt XPORTAL noch nicht.",
  },
];

/** Der Referenzstatus als Aussage darüber, was XPORTAL geprüft hat. */
export function profileCheck(referenceStatus: string | null): { text: string; verified: boolean } | null {
  switch (referenceStatus) {
    case null:
      return null;
    case "Verifiziert":
      return { text: "Profilprüfung durch XPORTAL abgeschlossen", verified: true };
    case "Selbstauskunft":
      return { text: "Angaben laut Freelancer; Referenzen nicht geprüft", verified: false };
    case "Nicht verifiziert":
      return { text: "Noch nicht von XPORTAL geprüft", verified: false };
    default:
      return { text: `Prüfstatus: ${referenceStatus}`, verified: false };
  }
}
