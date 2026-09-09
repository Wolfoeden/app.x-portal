/**
 * Die Sätze und Zusätze der Lead-Arbeitsfläche.
 *
 * Eigene Datei, weil es hier um Aussagen geht und nicht um Darstellung: Was
 * „Heute verschickt 25" bedeutet, wenn die Tagesmenge bei zwanzig liegt, ist
 * eine Frage, die sich prüfen lässt — in der Seite selbst läge sie zwischen
 * Datenbankaufrufen und JSX und würde von keinem Test erreicht.
 *
 * Reine Funktionen, kein `server-only`: Die Seite ruft sie, die Tests auch.
 */

export type MetrikTon = "default" | "accent" | "warning" | "muted";

function anzahl(wert: number, einzahl: string, mehrzahl: string): string {
  return `${wert} ${wert === 1 ? einzahl : mehrzahl}`;
}

/**
 * Der Zusatz unter „Heute verschickt".
 *
 * Bis zum 8. September stand dort stur „von 20 am Tag", auch als
 * fünfundzwanzig draußen waren — „25 von 20" liest sich wie ein Tippfehler
 * und war doch die Wahrheit: Der Einzelversand ging an der Tagesprüfung
 * vorbei. Die Bremse sitzt inzwischen im Versandweg selbst; der Fall bleibt
 * trotzdem möglich, etwa wenn die Tagesmenge nachträglich kleiner wird.
 */
export function versandDetail(
  heute: number,
  tagesmenge: number,
): { detail: string; tone: MetrikTon } {
  if (heute > tagesmenge) {
    return {
      detail: `${heute - tagesmenge} über der Tagesmenge von ${tagesmenge}`,
      tone: "warning",
    };
  }
  if (tagesmenge > 0 && heute === tagesmenge) {
    return { detail: `Tagesmenge von ${tagesmenge} erreicht`, tone: "default" };
  }
  return { detail: `von ${tagesmenge} am Tag`, tone: "default" };
}

export type SchrittEingabe = {
  /** Leads, die der nächste Abgleichlauf anfassen würde. */
  abzugleichen: number;
  /** Fertige Entwürfe, die auf das Versandfenster warten. */
  vorbereitet: number;
  verschicktHeute: number;
  tagesmenge: number;
  mailReady: boolean;
};

/**
 * Was als Nächstes ansteht — ein Satz, nicht zehn Kacheln.
 *
 * Die Reihenfolge ist die Reihenfolge der Arbeit: Ohne eingerichteten
 * Versand ist alles andere zweitrangig, dann kommt der Abgleich, dann der
 * Versand. Genannt wird immer nur der erste offene Punkt; eine Liste aller
 * Punkte wäre wieder das, was die Seite vorher war.
 */
export function naechsterSchritt(eingabe: SchrittEingabe): string {
  if (!eingabe.mailReady) {
    return "Der Mailversand ist nicht eingerichtet — Entwürfe entstehen, verschickt wird nichts.";
  }
  if (eingabe.abzugleichen > 0) {
    return `${anzahl(eingabe.abzugleichen, "Lead wartet", "Leads warten")} auf den Abgleich.`;
  }
  if (eingabe.vorbereitet > 0) {
    const rest = eingabe.tagesmenge - eingabe.verschicktHeute;
    if (rest > 0) {
      return `${anzahl(eingabe.vorbereitet, "Entwurf wartet", "Entwürfe warten")} auf den Versand, heute sind noch ${rest} möglich.`;
    }
    return `${anzahl(eingabe.vorbereitet, "Entwurf wartet", "Entwürfe warten")}; die Tagesmenge von ${eingabe.tagesmenge} ist ausgeschöpft, weiter geht es morgen.`;
  }
  return "Nichts zu tun: kein Lead wartet auf den Abgleich, kein Entwurf auf den Versand.";
}

/**
 * Warum eine Ergebniszahl größer sein kann als die ganze Warteschlange.
 *
 * Ein Vorgang überlebt den Lead: Wird der Lead gelöscht, bleibt der Abgleich
 * und bleibt der Versandbeleg — nur der Bezug fehlt. Die alte Fassung sagte
 * „284 davon ohne Lead in der Liste", was sich wie ein Filter las, den man
 * öffnen kann. Öffnen lässt sich davon nichts.
 */
export function herkunftsHinweis(ohneLead: number, gesamt: number): string {
  if (!gesamt) return "noch nichts";
  if (!ohneLead) return "alle noch in der Liste";
  if (ohneLead >= gesamt) return "sämtlich zu gelöschten Leads";
  return `${ohneLead} davon zu gelöschten Leads`;
}
