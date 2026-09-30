/**
 * Die erste Zeile der Nachricht, die das Formular „Projektdaten“ schickt.
 *
 * Eigene Datei, weil das Formular im Browser läuft: Es soll nicht den ganzen
 * Parser mitladen, nur um diesen Satz zu kennen. Der Server erkennt daran,
 * dass die Zeilen „- Feld: Wert“ bestätigte Werte sind (confirmed-fields.ts).
 */
export const BRIEF_EDIT_MARKER = "Ich habe die Projektdaten angepasst.";
