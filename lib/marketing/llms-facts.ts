/**
 * Datenschutz in Sätzen, die wörtlich auf /datenwege stehen
 * (tests/seo.test.ts prüft das); ausgegeben in app/llms.txt/route.ts. Hier
 * wird nichts behauptet, was dort nicht steht — insbesondere nicht, dass jede
 * Verarbeitung in der EU stattfindet.
 */
export const LLMS_DATA_FACTS = [
  "Die Datenbank von XPORTAL liegt in der EU. Das heißt nicht, dass jede Verarbeitung dort stattfindet: Der Hosting-Dienstleister hat seinen Sitz in den USA, und Dienstleister können Unterauftragnehmer außerhalb der EU einsetzen.",
  "Der Dienstleister für Datenbank, Anmeldung und Sicherungen betreibt das genutzte Projekt in Irland (eu-west-1).",
  "Für die Analyse geht der Text mit einer pseudonymen Sicherheitskennung an einen KI-Dienstleister mit Sitz in Irland. Dort wird kein Gesprächsverlauf gespeichert, und Inhalte aus XPORTAL werden nicht zum Training von Modellen verwendet.",
  "Den Abgleich mit den Freelancer-Profilen rechnet XPORTAL selbst, nach festen Regeln und ohne weitere Übermittlung.",
  "Die Website und die Serverfunktionen betreibt ein Dienstleister für Hosting und Auslieferungsnetz mit Sitz in den USA. Die Auslieferung erfolgt über Standorte in der EU; dabei fallen technische Verbindungsdaten wie IP-Adresse und aufgerufene Adresse an.",
  "verschickt ein Dienstleister mit Sitz in Deutschland; die Verarbeitung findet in der EU statt.",
] as const;
