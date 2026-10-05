import type { Metadata } from "next";
import Link from "next/link";
import "@/app/styles/legal.css";

import {
  PublicDocumentIntro,
  PublicFooter,
  PublicHeader,
} from "@/components/public/PublicChrome";
import { placementRequestsEnabled } from "@/lib/placement/config";

export const metadata: Metadata = {
  title: "Datenwege | XPORTAL",
  description:
    "Wohin Ihre Projektbeschreibung geht: gespeichert, strukturiert, abgeglichen. Die Datenbank liegt in der EU; nicht jede Verarbeitung findet dort statt.",
};

/**
 * Die Datenwege in klarer Sprache (Audit P2, Datenschutz).
 *
 * Wer eine vertrauliche Ausschreibung einfügen will, soll vorher sehen, wohin
 * der Text geht, ohne die ganze Datenschutzerklärung zu lesen oder erst
 * nachzufragen. Jede Aussage hier steht so schon in app/privacy/page.tsx
 * (Abschnitte 2, 4 und 9); die Seite fasst zusammen und ersetzt sie nicht.
 * Dienstleister heißen hier wie dort nach Aufgabe und Sitz.
 */
export default function DataFlowsPage() {
  const placement = placementRequestsEnabled();
  return (
    <div className="xlegal" lang="de">
      <PublicHeader context="Datenwege" />
      <main className="xlegal-document">
        <PublicDocumentIntro
          eyebrow="Datenwege"
          title="Wohin Ihre Projektbeschreibung geht."
          signal={{ label: "Datenbank", value: "Irland (EU)" }}
        >
          <p>
            Die Datenbank von XPORTAL liegt in der EU. Das heißt nicht, dass
            jede Verarbeitung dort stattfindet: Der Hosting-Dienstleister hat
            seinen Sitz in den USA, und Dienstleister können Unterauftragnehmer
            außerhalb der EU einsetzen. Hier steht, welcher Schritt wohin geht.
            Verbindlich ist die <Link href="/privacy">Datenschutzerklärung</Link>.
          </p>
        </PublicDocumentIntro>

        <section>
          <h2>1. Speichern</h2>
          <div>
            <p>
              Projektbeschreibung, Nachrichten, die daraus abgeleiteten
              Anforderungen und die Ergebnisse speichert XPORTAL in der
              Anwendungsdatenbank. Der Dienstleister für Datenbank, Anmeldung
              und Sicherungen betreibt das genutzte Projekt in Irland
              (<code>eu-west-1</code>).
            </p>
          </div>
        </section>

        <section>
          <h2>2. Strukturieren mit KI</h2>
          <div>
            <p>
              Für die Analyse geht der Text mit einer pseudonymen
              Sicherheitskennung an einen KI-Dienstleister mit Sitz in Irland.
              Dort wird kein Gesprächsverlauf gespeichert, und Inhalte aus
              XPORTAL werden nicht zum Training von Modellen verwendet.
              Sicherheits- und Missbrauchsprotokolle des Dienstleisters können
              bis zu 30 Tage aufbewahrt werden. Der Dienstleister setzt
              Unterauftragsverarbeiter ein; Übermittlungen außerhalb des EWR
              sind durch Angemessenheitsbeschluss oder
              Standardvertragsklauseln abgesichert.
            </p>
          </div>
        </section>

        <section>
          <h2>3. Abgleichen</h2>
          <div>
            <p>
              Den Abgleich mit den Freelancer-Profilen rechnet XPORTAL selbst,
              nach festen Regeln und ohne weitere Übermittlung. Eine externe
              Recherche läuft nur, wenn Sie sie ausdrücklich starten; dann geht
              der strukturierte Projektbrief für eine Websuche an denselben
              KI-Dienstleister.
            </p>
          </div>
        </section>

        <section>
          <h2>4. Ausliefern</h2>
          <div>
            <p>
              Die Website und die Serverfunktionen betreibt ein Dienstleister
              für Hosting und Auslieferungsnetz mit Sitz in den USA. Die
              Auslieferung erfolgt über Standorte in der EU; dabei fallen
              technische Verbindungsdaten wie IP-Adresse und aufgerufene
              Adresse an.
            </p>
          </div>
        </section>

        <section>
          <h2>5. Weitergeben, nur auf Ihren Schritt</h2>
          <div>
            <ul>
              {placement ? (
                <li>
                  <strong>Anfrage an einen Freelancer:</strong> Bei der
                  Vorstellung erhält der Freelancer Ihren Namen, Ihre
                  E-Mail-Adresse und den Titel Ihres Projekts, nicht die ganze
                  Beschreibung.
                </li>
              ) : null}
              <li>
                <strong>E-Mails</strong> wie Bestätigungen verschickt ein
                Dienstleister mit Sitz in Deutschland; die Verarbeitung findet
                in der EU statt.
              </li>
              <li>
                <strong>Zahlung:</strong> erst nach Ihrem Klick auf einen
                Tarif, über einen Zahlungsdienstleister mit Sitz in Irland, der
                Daten an sein Mutterunternehmen in den USA weitergibt.
              </li>
              <li>
                <strong>Anmeldung über Google</strong> nur, wenn Sie diesen Weg
                wählen.
              </li>
              <li>
                <strong>Kontaktformular:</strong> Ein Dienstleister mit Sitz in
                den USA schützt es vor automatisierten Eingaben und erhält dabei
                IP-Adresse und Browserangaben. Der Chat nutzt ihn nicht.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2>6. Vertrauliche Ausschreibungen</h2>
          <div>
            <p>
              Für die Auswahl reichen Rolle, Kompetenzen, Zeitraum, Umfang und
              Rahmen. Kundennamen, interne Projektnamen und Daten einzelner
              Personen können Sie vor dem Einfügen entfernen. Die Namen der
              Dienstleister nennen wir Ihnen auf formlose Anfrage an{" "}
              <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>.
            </p>
          </div>
        </section>

        <section>
          <h2>7. Für Freelancer: Profil aus Lebenslauf oder Code-Hosting</h2>
          <div>
            <p>
              Wer sich als Freelancer bewirbt, kann Angaben übernehmen statt
              sie abzutippen, nur auf eigenen Klick. Ein Lebenslauf (PDF) geht
              dafür mit einer pseudonymen Sicherheitskennung an denselben
              KI-Dienstleister mit Sitz in Irland wie die Projektanalyse; auch
              hier wird kein Gesprächsverlauf gespeichert und nichts zum
              Training verwendet. Für Angaben aus einem Code-Hosting-Dienst
              fragt XPORTAL dort die öffentlichen Angaben zum genannten
              Nutzernamen ab (Sitz in den USA). Der Entwurf füllt nur leere Felder und wird erst mit dem
              Absenden der Bewerbung gespeichert. Übernommene Angaben gelten
              als Angaben der Person, nicht als geprüft.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
