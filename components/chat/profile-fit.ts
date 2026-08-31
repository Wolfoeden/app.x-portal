/**
 * Wann meldet sich ein Treffer beim ersten Erscheinen selbst?
 *
 * Die Eignung stand als Block in Worten auf der Karte — Ueberschrift, Zaehlung,
 * Balken, Vorbehalt. Vier Zeilen fuer eine Aussage, die man sehen und nicht
 * lesen will. Geblieben ist ein einmaliger gruener Puls, wenn die Kernabdeckung
 * ueber der Empfehlungsschwelle liegt.
 *
 * Die Schwelle kommt bewusst aus derselben Konstante wie die Empfehlung selbst.
 * Eine eigene Zahl hier wuerde irgendwann von der Schwelle abweichen, ab der ein
 * Profil ueberhaupt empfohlen wird — dann leuchtete eine Karte auf, die als
 * "nicht empfohlen" danebensteht.
 */
import type { FreelancerProfileResult } from "../chat-contract";

export function shouldHighlightProfile(
  profile: Pick<FreelancerProfileResult, "coreCoverage" | "recommendationRole">,
  recommendationThresholdPercent: number,
): boolean {
  if (profile.recommendationRole === "partial") return false;
  if (profile.coreCoverage === null) return false;
  return profile.coreCoverage > recommendationThresholdPercent;
}
