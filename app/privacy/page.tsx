import type { Metadata } from "next";
import Link from "next/link";

import { CookieSettingsButton } from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: "Datenschutz | XPORTAL",
  description: "Datenschutzerklärung für die XPORTAL Website und Anwendung.",
};

export default function PrivacyPage() {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">XPORTAL</Link>
        <span>DATENSCHUTZ / 01</span>
      </header>

      <article className="xlegal-document">
        <p className="xhome-label">Datenschutzerklärung</p>
        <h1>Transparent vom ersten Klick bis zum gespeicherten Projekt.</h1>
        <p className="xlegal-lead">
          Diese Erklärung informiert Sie gemäß Art. 13 und 14 DSGVO darüber,
          welche personenbezogenen Daten XPORTAL beim Besuch der Website, bei
          der Anmeldung und bei der Nutzung der Anwendung verarbeitet.
        </p>

        <section>
          <h2>1. Verantwortlicher und Begriffe</h2>
          <div>
            <p>
              300 – Inhaber Roman Dering<br />
              Einzelunternehmen<br />
              Heilig-Kreuz-Straße 18<br />
              87600 Kaufbeuren<br />
              Deutschland
            </p>
            <p>
              E-Mail: <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>
            </p>
            <p>
              <strong>XPORTAL</strong> bezeichnet in dieser Erklärung die unter
              x-portal.eu erreichbare Website samt Anwendung und zugleich den
              oben genannten Verantwortlichen, der sie betreibt.{" "}
              <strong>Nutzer</strong> bezeichnet jede natürliche Person, die
              XPORTAL aufruft oder verwendet — als Gast, mit einem Konto oder
              als Freelancer mit einem Profil. <strong>Dienstleister</strong>{" "}
              bezeichnet ein Unternehmen, das für XPORTAL einen abgegrenzten
              technischen Beitrag erbringt; welche Arten das sind und wo sie
              verarbeiten, steht in Abschnitt 10.
            </p>
            <p>
              Dienstleister werden hier nach Aufgabe und Verarbeitungsort
              benannt, nicht mit Firmennamen. Auf formlose Anfrage an die oben
              genannte Adresse teilen wir Ihnen die konkreten Unternehmen
              jederzeit mit — ebenso, welche davon Ihre Daten im Einzelfall
              erhalten haben.
            </p>
          </div>
        </section>

        <section>
          <h2>2. Website und Hosting</h2>
          <div>
            <p>
              Beim Aufruf von XPORTAL werden technisch erforderliche
              Verbindungsdaten verarbeitet. Dazu können IP-Adresse, Datum und
              Uhrzeit, aufgerufene URL, Referrer, Browser- und Geräteangaben
              sowie Antwort- und Fehlerstatus gehören. Die Auslieferung
              übernimmt ein Dienstleister für Hosting und Auslieferungsnetz mit
              Sitz in den USA; die Auslieferung selbst erfolgt über Standorte
              innerhalb der Europäischen Union.
            </p>
            <p>
              Die Verarbeitung dient der sicheren Auslieferung, Fehleranalyse
              und Abwehr von Missbrauch. Rechtsgrundlage ist Art. 6 Abs. 1
              lit. f DSGVO; unser berechtigtes Interesse ist ein sicherer,
              stabiler und nachvollziehbarer Betrieb.
            </p>
            <p>
              Für die Ratenbegrenzung führt die Anwendungsdatenbank je
              Zeitfenster einen Zähler. Der zugehörige Schlüssel enthält bei
              IP-bezogenen Grenzen ausschließlich eine kryptografische
              Ableitung (HMAC) der IP-Adresse, nie die Adresse selbst. Ein
              abgelaufener Zähler wird täglich gelöscht.
            </p>
          </div>
        </section>

        <section>
          <h2>3. Gastzugang und Konto</h2>
          <div>
            <p>
              Für die Nutzung des Chats erzeugt der eingesetzte
              Authentifizierungs- und Datenbankdienst zunächst eine anonyme
              Benutzerkennung. Sie ordnet Projekte und Nachrichten einem
              Zugriff zu. Bei einem dauerhaften Konto verarbeitet XPORTAL
              zusätzlich die E-Mail-Adresse, den gewählten Anmeldeweg,
              Authentifizierungsmetadaten und Sitzungsinformationen.
            </p>
            <p>
              Sie können sich auch über einen externen Anmeldeanbieter
              anmelden. Die Verbindung dorthin entsteht erst nach Ihrem Klick
              auf die entsprechende Schaltfläche, die den Anbieter benennt.
              Dieser führt die Anmeldung durch; XPORTAL erhält die dafür
              freigegebenen Kontodaten, insbesondere eine Anbieterkennung und —
              abhängig von der im Dialog des Anbieters angezeigten Freigabe —
              E-Mail- und Profildaten. Dieser Weg ist freiwillig; alternativ
              steht die Anmeldung per E-Mail zur Verfügung. Für die
              Verarbeitung beim Anmeldeanbieter gilt dessen eigene
              Datenschutzerklärung, die im Anmeldedialog verlinkt ist.
            </p>
            <p>
              Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die
              Verarbeitung zur Bereitstellung des gewünschten Kontos und der
              Anwendung oder für vorvertragliche Maßnahmen erforderlich ist.
              Sicherheits- und Missbrauchsschutzmaßnahmen beruhen ergänzend auf
              Art. 6 Abs. 1 lit. f DSGVO.
            </p>
          </div>
        </section>

        <section>
          <h2>4. Chat, Matching und KI-Verarbeitung</h2>
          <div>
            <p>
              XPORTAL speichert Ihre Projektbeschreibung, Nachrichten,
              strukturierte Anforderungen, ausgewählte Profile,
              Matching-Ergebnisse und zugehörige Zeitstempel in der
              Anwendungsdatenbank. Bitte geben Sie keine besonderen Kategorien
              personenbezogener Daten oder vertrauliche Daten Dritter ein,
              sofern dies nicht notwendig und rechtlich zulässig ist.
            </p>
            <p>
              Zur Strukturierung der Projektbeschreibung übermittelt XPORTAL
              den erforderlichen Text und eine pseudonyme Sicherheitskennung an
              die Schnittstelle eines KI-Dienstleisters mit Sitz in Irland.
              Anfragen werden so gestellt, dass dort kein Gesprächsverlauf
              gespeichert wird (<code>store: false</code>). Das schließt
              eigenständige Sicherheits- und Missbrauchsprotokolle des
              Dienstleisters nicht aus; nach dessen veröffentlichten
              Datenkontrollen können solche Protokolle im Standardbetrieb bis
              zu 30 Tage aufbewahrt werden. Inhalte aus XPORTAL werden dort
              nicht zum Training von Modellen verwendet.
            </p>
            <p>
              Bei einer von Ihnen ausdrücklich gestarteten externen
              Freelancer-Suche wird der strukturierte Projektbrief für eine
              Websuche an denselben KI-Dienstleister übermittelt. Quellen,
              Ergebnisstände, URLs, Zeitstempel und technische Kennungen können
              zur Nachvollziehbarkeit gespeichert werden. Rechtsgrundlage ist
              Art. 6 Abs. 1 lit. b DSGVO für die angeforderte Leistung;
              Sicherheits- und Kostenkontrollen beruhen auf Art. 6 Abs. 1
              lit. f DSGVO.
            </p>
          </div>
        </section>

        <section>
          <h2>5. Freelancer-Profildaten</h2>
          <div>
            <p>
              Kuratierte und bei einer externen Suche gefundene Profile können
              berufliche personenbezogene Daten enthalten, etwa Name,
              Tätigkeit, Kompetenzen, Standort, Verfügbarkeit, berufliche URL
              und Quellenhinweise. Die Daten stammen aus direkten Angaben,
              freigegebenen Profilen oder öffentlich zugänglichen beruflichen
              Quellen.
            </p>
            <p>
              Zweck ist, geschäftliche Projektanfragen mit nachvollziehbaren
              beruflichen Profilen abzugleichen. Rechtsgrundlage ist Art. 6 Abs.
              1 lit. f DSGVO; unser berechtigtes Interesse ist die Vermittlung
              geeigneter beruflicher Kontakte. Betroffene Freelancer können
              dieser Verarbeitung aus Gründen ihrer besonderen Situation
              widersprechen und Berichtigung oder Löschung verlangen. XPORTAL
              trifft keine automatische Einstellungs- oder Vertragsentscheidung.
            </p>
            <p>
              Stammen die Daten nicht von der betroffenen Person selbst, sondern
              aus einer Recherche in öffentlich zugänglichen Quellen,
              informieren wir die betroffene Person nach Art. 14 DSGVO —
              spätestens einen Monat nach der Erhebung, mit Angabe von Zweck,
              Herkunft, Speicherdauer und Widerspruchsrecht. Erfolgt bis dahin
              keine Information und keine Einwilligung, wird der Datensatz
              automatisch gelöscht. Recherchierte Profile werden bis zu einer
              Einwilligung nicht im Portal veröffentlicht.
            </p>
            <p>
              Ein Lebenslauf wird nur mit dokumentierter Berechtigung des
              betroffenen Freelancers in einem privaten, nicht öffentlich
              erreichbaren Dokumentenspeicher hinterlegt. Gäste erhalten weder den Lebenslauf noch einen
              Hinweis darauf, ob ein Dokument vorhanden ist. Angemeldete
              Nutzer können einen Lebenslauf nur zu einem Profil abrufen, das
              im neuesten gespeicherten Ergebnis ihres eigenen Projekts als
              primäre oder alternative Empfehlung ausgewiesen ist. Der Abruf
              erfolgt über einen kurzzeitig gültigen Download-Link und wird zu
              Sicherheits- und Nachweiszwecken protokolliert. Nicht empfohlene
              Teiltreffer erhalten keinen Dokumentzugriff.
            </p>
          </div>
        </section>

        <section>
          <h2>6. Whitelist</h2>
          <div>
            <p>
              Bei einer freiwilligen Whitelist-Anmeldung verarbeiten wir Name,
              E-Mail-Adresse, Land, Quelle und Einwilligungszeitpunkt, um die
              Anmeldung zu verwalten und die ausdrücklich gewünschten Start-
              und Onboarding-Informationen zu senden. Rechtsgrundlage ist Ihre
              Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO.
            </p>
            <p>
              Die Anmeldung wird im Doppelbestätigungsverfahren geprüft. Nach
              dem Absenden speichern wir den Eintrag zunächst als unbestätigt
              und senden einen Bestätigungslink an die angegebene Adresse. Erst
              mit Ihrem Klick auf diesen Link entsteht die Einwilligung; vorher
              erhalten Sie von uns keine weiteren Nachrichten. Dazu speichern
              wir eine kryptografische Ableitung des Bestätigungstokens, dessen
              Ablaufzeitpunkt und den Zeitpunkt der Bestätigung — Letzterer ist
              der Nachweis nach Art. 7 Abs. 1 DSGVO. Ein unbestätigter Eintrag
              wird nach 30 Tagen automatisch gelöscht.
            </p>
            <p>
              Sie können die Einwilligung jederzeit mit Wirkung für die Zukunft
              per E-Mail an <a href="mailto:info@x-portal.eu?subject=Widerruf%20Whitelist">info@x-portal.eu</a> widerrufen.
              Die Rechtmäßigkeit der Verarbeitung bis zum Widerruf bleibt
              unberührt.
            </p>
          </div>
        </section>

        <section>
          <h2>7. Externe Buchungslinks</h2>
          <div>
            <p>
              Die Buchungsseite eines Freelancers wird nicht eingebettet und
              nicht automatisch aufgerufen. Erst wenn Sie den
              gekennzeichneten Link anklicken, entsteht eine direkte Verbindung
              zum jeweiligen Anbieter. Dieser verarbeitet technische
              Verbindungsdaten und die Angaben, die Sie dort selbst eingeben.
              XPORTAL übermittelt dabei keinen Chattext an den Buchungsanbieter.
            </p>
          </div>
        </section>

        <section>
          <h2>8. Kontaktanfragen</h2>
          <div>
            <p>
              Wenn Sie das <a href="/contact">Kontaktformular</a> nutzen,
              verarbeiten wir Ihren Namen, Ihre E-Mail-Adresse, den Betreff und
              den Text Ihrer Nachricht, um das Anliegen zu bearbeiten und zu
              beantworten. Weitere Angaben erheben wir dabei nicht; insbesondere
              speichern wir zu einer Kontaktanfrage weder IP-Adresse noch
              Browserkennung oder Referrer.
            </p>
            <p>
              Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit Ihr
              Anliegen einen Vertrag oder dessen Anbahnung betrifft, sonst Art.
              6 Abs. 1 lit. f DSGVO mit unserem berechtigten Interesse an einer
              nachvollziehbaren Bearbeitung von Anfragen. Die Angabe der
              genannten Daten ist für die Bearbeitung erforderlich; alternativ
              erreichen Sie uns unter{" "}
              <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>.
            </p>
            <p>
              Wir löschen eine Anfrage, sobald sie erledigt ist und keine
              gesetzliche Aufbewahrungspflicht entgegensteht. Führt die Anfrage
              zu einem Vertrag, kann sie als Handelsbrief längeren gesetzlichen
              Fristen unterliegen. Eine automatische Empfangsbestätigung per
              E-Mail versenden wir nicht.
            </p>
          </div>
        </section>

        <section>
          <h2>9. Cookies und Sitzungsspeicher</h2>
          <div>
            <p>
              XPORTAL verwendet derzeit keine Analyse- oder Marketingcookies.
              Folgende Speicherungen dienen ausschließlich Anmeldung,
              Sicherheit, Funktionsfähigkeit und Ihrer Auswahl:
            </p>
            <ul>
              <li><code>xportal_cookie_consent</code>: speichert Ihre Auswahl für 180 Tage.</li>
              <li><code>sb-…</code>: Cookies des Authentifizierungsdienstes für Gast- oder Kontositzungen; Laufzeit entsprechend der jeweiligen Sitzung.</li>
              <li><code>xportal_guest_claim</code>: einmaliger, HTTP-only geschützter Übertragungsnachweis für maximal 30 Minuten.</li>
              <li><code>xportal_email_auth_state</code>: HTTP-only Sicherheitsstatus für E-Mail-Links, maximal eine Stunde.</li>
              <li><code>sessionStorage</code>: vorübergehende Projekt-, Profil-, Anfrage- und Wiederherstellungsdaten bis zum Schließen des Browser-Tabs oder früherer programmgesteuerter Löschung.</li>
            </ul>
            <p>
              Diese Speicherungen sind für ausdrücklich angeforderte Funktionen
              erforderlich und werden auf § 25 Abs. 2 Nr. 2 TDDDG gestützt. Eine
              Einwilligung ist dafür nicht erforderlich, und wir holen auch
              keine ein: Der Hinweis beim ersten Besuch ist eine Kenntnisnahme,
              keine Auswahl — es gibt derzeit keinen optionalen Dienst, den sie
              aktivieren könnte. Sollte künftig einer hinzukommen, wird zuvor
              eine neue, konkrete Einwilligung eingeholt, und er wird nicht
              geladen, bevor sie vorliegt.
            </p>
            <CookieSettingsButton />
          </div>
        </section>

        <section>
          <h2>10. Empfänger und Drittländer</h2>
          <div>
            <p>
              Je nach genutzter Funktion erhalten folgende Kategorien von
              Empfängern Daten. Die Namen der Unternehmen nennen wir Ihnen auf
              formlose Anfrage; die Angaben zu Aufgabe, Sitz und
              Verarbeitungsort stehen hier, weil Sie danach entscheiden können,
              ob Sie eine Funktion nutzen wollen.
            </p>
            <ul>
              <li>
                ein Dienstleister für <strong>Hosting und Auslieferungsnetz</strong>{" "}
                (Serverfunktionen, technische Protokolle); Sitz in den USA,
                Auslieferung über Standorte in der EU;
              </li>
              <li>
                ein Dienstleister für <strong>Authentifizierung, Datenbank,
                privaten Dokumentenspeicher und Sicherungen</strong>; das
                genutzte Projekt ist in Irland (<code>eu-west-1</code>)
                eingerichtet;
              </li>
              <li>
                ein <strong>KI-Dienstleister</strong> mit Sitz in Irland samt
                dessen Unterauftragsverarbeitern, für die von Ihnen
                angeforderten KI-Funktionen;
              </li>
              <li>
                ein <strong>Anmeldeanbieter</strong>, und zwar erst, wenn Sie
                die Anmeldung über ihn wählen;
              </li>
              <li>
                der jeweils angezeigte <strong>Buchungsanbieter</strong> eines
                Freelancers, erst nach Ihrem Klick auf dessen Link;
              </li>
              <li>
                ein <strong>Zahlungsdienstleister</strong> mit Sitz in Irland,
                erst nach Ihrem Klick auf „Plan buchen“; dabei wird Ihre
                XPORTAL-Kontokennung übergeben, damit die Zahlung Ihrem Konto
                zugeordnet werden kann. Dieser Dienstleister leitet Daten an
                sein Mutterunternehmen in den USA weiter;
              </li>
              <li>
                ein <strong>E-Mail-Versanddienstleister</strong> mit Sitz in
                Deutschland für Transaktionsnachrichten wie Bestätigung,
                Anmeldung oder Wiederherstellung; die Verarbeitung findet
                innerhalb der EU statt;
              </li>
              <li>
                ein <strong>Dienstleister zur Abwehr automatisierter
                Eingaben</strong> mit Sitz in den USA, auf dem Kontakt- und dem
                Whitelist-Formular. Das Prüf-Widget wird beim Aufruf dieser
                beiden Seiten geladen und erhält dabei Ihre IP-Adresse, Angaben
                zu Browser und Gerät sowie Ihr Verhalten im Widget. Dies ist
                eine Übermittlung in ein Drittland.
              </li>
            </ul>
            <p>
              Soweit Anbieter als Auftragsverarbeiter tätig sind, erfolgt die
              Verarbeitung auf Grundlage der Vereinbarungen nach Art. 28 DSGVO.
              Übermittlungen außerhalb des Europäischen Wirtschaftsraums
              erfolgen nur, soweit ein Angemessenheitsbeschluss einschließlich
              einer gültigen Teilnahme am EU-US Data Privacy Framework besteht
              oder geeignete Garantien wie EU-Standardvertragsklauseln
              vereinbart sind. Informationen zu den einschlägigen Garantien
              erhalten Sie über die oben genannte Kontaktadresse.
            </p>
          </div>
        </section>

        <section>
          <h2>11. Speicherdauer</h2>
          <div>
            <p>
              Wir speichern personenbezogene Daten nur so lange, wie sie für
              den jeweiligen Zweck erforderlich sind, eine Einwilligung gilt
              oder gesetzliche Pflichten bestehen. Die technisch hinterlegten
              Standardfristen sehen insbesondere vor:
            </p>
            <ul>
              <li>ungenutzte anonyme Auth-Konten und abgelaufene Gast-Übertragungsnachweise: Prüfung beziehungsweise Löschung nach 30 Tagen;</li>
              <li>Nachrichten in inaktiven Projekten: 180 Tage;</li>
              <li>inaktive Projekte, Match-Snapshots und externe Suchergebnisse: Prüfung beziehungsweise Löschung nach 365 Tagen;</li>
              <li>Lebensläufe von Freelancern: bis zum Widerruf der Bereitstellung, zur Beendigung des Vermittlungszwecks oder bis zu einer früheren berechtigten Löschanfrage; die Erforderlichkeit wird bei Profilprüfung und Deaktivierung erneut geprüft;</li>
              <li>unbestätigte Whitelist-Anmeldungen: automatische Löschung nach 30 Tagen;</li>
              <li>bestätigte Whitelist-Datensätze: Überprüfung nach 365 Tagen und Löschung, wenn keine Rechtsgrundlage mehr besteht;</li>
              <li>Kontaktanfragen: Löschung nach Erledigung, spätestens Überprüfung nach 365 Tagen;</li>
              <li>Zähler der Ratenbegrenzung: Löschung am Tag nach Ablauf des jeweiligen Zeitfensters;</li>
              <li>technische KI-Nutzungsdaten: je nach Kontotyp und Abrechnungsfenster 90 bis 400 Tage;</li>
              <li>Audit- und Vermittlungsnachweise: grundsätzlich bis zu 730 Tage; danach Löschung oder Pseudonymisierung nach der geltenden Richtlinie;</li>
              <li>rechtlich oder abrechnungsbezogen erforderliche minimale Ledger-Daten: Prüfung spätestens nach 2.555 Tagen.</li>
            </ul>
            <p>
              Eine berechtigte Löschanfrage kann zu einer früheren Löschung
              führen. Gesetzliche Aufbewahrungspflichten und die Abwehr oder
              Geltendmachung von Rechtsansprüchen können eine längere,
              zweckgebundene Aufbewahrung einzelner Nachweise erfordern.
            </p>
          </div>
        </section>

        <section>
          <h2>12. Ihre Rechte</h2>
          <div>
            <p>
              Sie haben nach Maßgabe der DSGVO das Recht auf Auskunft,
              Berichtigung, Löschung, Einschränkung der Verarbeitung,
              Datenübertragbarkeit und Widerspruch. Eine erteilte Einwilligung
              können Sie jederzeit mit Wirkung für die Zukunft widerrufen.
            </p>
            <p>
              Angemeldete Nutzer können den in der Anwendung angebotenen
              Datenexport und die Kontolöschung verwenden. Für alle Anliegen –
              insbesondere zu Whitelist- oder Freelancer-Daten – erreichen Sie
              uns unter <a href="mailto:info@x-portal.eu">info@x-portal.eu</a>.
              Vor der Bearbeitung können wir einen Identitätsnachweis verlangen,
              soweit dies zum Schutz Ihrer Daten erforderlich ist.
            </p>
          </div>
        </section>

        <section>
          <h2>13. Beschwerderecht</h2>
          <div>
            <p>
              Sie können sich bei einer Datenschutzaufsichtsbehörde beschweren.
              Für private Unternehmen in Bayern ist regelmäßig das
              Bayerische Landesamt für Datenschutzaufsicht, Promenade 18,
              91522 Ansbach, zuständig. Das
              <a href="https://www.lda.bayern.de/de/beschwerde.html" target="_blank" rel="noreferrer"> Online-Beschwerdeformular des BayLDA</a> steht öffentlich zur Verfügung.
            </p>
          </div>
        </section>

        <section>
          <h2>14. Datenbereitstellung und Automatisierung</h2>
          <div>
            <p>
              Whitelist und die Anmeldung über einen externen Anbieter sind
              freiwillig. Ohne die für eine
              Sitzung, ein Konto oder eine Projektanfrage erforderlichen Daten
              kann die jeweilige Funktion nicht bereitgestellt werden.
            </p>
            <p>
              KI unterstützt die Strukturierung Ihrer Angaben. Das Matching
              filtert und sortiert Profile anhand dokumentierter Regeln. Es
              findet keine ausschließlich automatisierte Entscheidung mit
              rechtlicher oder ähnlich erheblicher Wirkung im Sinne von Art. 22
              DSGVO statt. Sie entscheiden selbst, ob Sie ein Profil auswählen
              oder einen externen Buchungslink öffnen.
            </p>
          </div>
        </section>

        <section>
          <h2>15. Änderungen</h2>
          <div>
            <p>
              Wir aktualisieren diese Erklärung, wenn sich Funktionen,
              Empfänger oder rechtliche Anforderungen ändern. Bei wesentlichen
              Änderungen an optionalen Diensten holen wir eine neue Auswahl ein,
              bevor diese Dienste geladen werden.
            </p>
          </div>
        </section>

        <p className="xlegal-updated">Stand: 28. August 2026</p>
      </article>

      <footer className="xlegal-footer">
        <Link href="/chat">Zurück zu XPORTAL</Link>
        <span>
          <Link href="/imprint">Impressum</Link>
          {" · "}
          <Link href="/terms">AGB</Link>
          {" · "}
          <Link href="/contact">Kontakt</Link>
        </span>
      </footer>
    </main>
  );
}
