/**
 * Wohin der Chat nach einer Änderung scrollt (Audit F08).
 *
 * Bisher folgte die Ansicht immer dem Ende. Nach einem Matching stand damit
 * das letzte Profil im Bild, Überschrift und Hauptvorschlag lagen darüber.
 * Jetzt beginnt ein neues Ergebnis oben; eine neue Nachricht oder der
 * Ladezustand folgen weiter dem Ende.
 */

export type ShownResult = { key: string; messages: number } | null;

export type ResultScrollInput = {
  pending: boolean;
  hasResult: boolean;
  /** Status und Profile des Ergebnisses; ändert sich mit jedem neuen Ergebnis. */
  resultKey: string;
  messages: number;
  /** Ob der Ergebnisabschnitt schon im DOM steht. */
  sectionShown: boolean;
};

export function resultScroll(
  shown: ShownResult,
  input: ResultScrollInput,
): { target: "result" | "end" | "none"; shown: ShownResult } {
  if (input.pending) return { target: "end", shown: null };
  if (!input.hasResult) return { target: "end", shown };
  if (shown?.key === input.resultKey) {
    // Dasselbe Ergebnis, neu gesetzt: Nur eine neue Nachricht darunter zieht
    // die Ansicht ans Ende.
    return { target: input.messages > shown.messages ? "end" : "none", shown };
  }
  // Steht der Abschnitt noch nicht (etwa während der Arbeitsplatz lädt), gilt
  // das Ergebnis erst beim nächsten Durchlauf als gezeigt.
  if (!input.sectionShown) return { target: "end", shown };
  return { target: "result", shown: { key: input.resultKey, messages: input.messages } };
}
