/**
 * Die Überschneidung zwischen einem Bedarf und einem Profil.
 *
 * Sie beantwortet die Frage, die in der Einladung stehen muss: *Warum
 * ausgerechnet Sie?* Ein Satz wie „Gefragt ist Erfahrung mit PostgreSQL, ETL
 * und Airflow — das steht so auch auf Ihrem Profil" ist überprüfbar und macht
 * aus einer Serienmail eine Ansprache.
 *
 * Verglichen wird über die Skill-Taxonomie des Hauses, nicht über
 * Zeichenketten: „React.js", „ReactJS" und „React" sind dieselbe Erfahrung,
 * und wer sie unterschiedlich schreibt, soll deswegen nicht durchfallen.
 */

import {
  canonicalSkill,
  normalizeSkill,
  skillFamilyKey,
} from "@/lib/domain/skill-taxonomy";

/**
 * Die Schreibweisen der Quelle auf die Form bringen, die die Taxonomie kennt.
 *
 * freelancermap führt „React.js", „Angular 2+" und „Node.js"; unsere
 * Ausschreibungen sagen „React", „Angular", „Node". Die Taxonomie in
 * `lib/domain/skill-taxonomy.ts` ist eine Liste fester Aliase und kennt diese
 * Varianten nicht.
 *
 * Bewusst **hier** und nicht dort: Jene Taxonomie entscheidet auch, welche
 * Profile ein zahlender Auftraggeber vorgeschlagen bekommt. Die Eigenheiten
 * einer einzelnen Beschaffungsquelle haben in dieser Entscheidung nichts zu
 * suchen — sie bleiben in der Spur, die sie erzeugt.
 */
function vereinheitliche(value: string): string {
  return value
    .trim()
    .replace(/\.js$/iu, "")
    .replace(/\s+js$/iu, "")
    // „Angular 2+", „Oracle 10g/11g", „Java v8" — die Versionsangabe macht aus
    // einer Erfahrung keine andere.
    //
    // Eine **nackte** Zahl am Ende bleibt dagegen stehen: „Microsoft 365" und
    // „Windows 11" sind Produktnamen, keine Versionen von „Microsoft" und
    // „Windows". Gestrichen wird nur, was auch als Version zu erkennen ist —
    // mit Plus, mit Buchstabenanhang oder mit einem vorangestellten „v".
    .replace(/\s+v\d+(?:\.\d+)*$/iu, "")
    .replace(/\s+\d+\+$/u, "")
    .replace(/\s+\d+[a-z]+(?:\s*\/\s*\d+[a-z]+)*$/iu, "")
    .replace(/\s+\d+(?:\.\d+)+$/u, "")
    .trim();
}

function key(value: string): string | null {
  const roh = vereinheitliche(value);
  if (!roh) return null;
  const canonical = canonicalSkill(roh);
  const familie = skillFamilyKey(canonical) ?? normalizeSkill(canonical);
  return familie || null;
}

export type SkillOverlap = {
  /** Gefragte Erfahrungen, die auch auf dem Profil stehen. */
  matching: string[];
  /** Gefragte Erfahrungen ohne Entsprechung auf dem Profil. */
  other: string[];
};

/**
 * Teilt die gefragten Erfahrungen in die, die das Profil belegt, und die
 * übrigen.
 *
 * Beschriftet wird mit **der Schreibweise des Bedarfs**, nicht mit der des
 * Profils: In der Nachricht steht, was der Auftraggeber sucht. Die
 * Reihenfolge des Bedarfs bleibt erhalten — sie ist nach Wichtigkeit sortiert.
 */
export function skillOverlap(
  demandSkills: readonly string[],
  profileSkills: readonly string[],
): SkillOverlap {
  const vorhanden = new Set<string>();
  for (const wert of profileSkills) {
    const schluessel = key(wert);
    if (schluessel) vorhanden.add(schluessel);
  }

  const matching: string[] = [];
  const other: string[] = [];
  const gesehen = new Set<string>();

  for (const wert of demandSkills) {
    const schluessel = key(wert);
    if (!schluessel || gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const beschriftung = canonicalSkill(vereinheitliche(wert));
    if (vorhanden.has(schluessel)) matching.push(beschriftung);
    else other.push(beschriftung);
  }

  return { matching, other };
}
