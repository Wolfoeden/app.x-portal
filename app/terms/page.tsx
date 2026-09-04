import type { Metadata } from "next";
import Link from "next/link";

import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "AGB | XPORTAL",
  description:
    "Allgemeine Geschäftsbedingungen für die Nutzung von XPORTAL. Das Angebot richtet sich ausschließlich an Unternehmer.",
};

export default function TermsPage() {
  return (
    <main className="xlegal" lang="de">
      <header className="xlegal-header">
        <Link href="/chat" className="xlegal-wordmark">XPORTAL</Link>
        <span>AGB / {TERMS_VERSION}</span>
      </header>

      <article className="xlegal-document">
        <p className="xhome-label">Allgemeine Geschäftsbedingungen</p>
        <h1>Was gilt, wenn Sie XPORTAL nutzen.</h1>
        <p className="xlegal-lead">
          Diese Bedingungen regeln die Nutzung der Website und der Anwendung
          XPORTAL sowie die kostenpflichtigen Leistungen. Das Angebot richtet
          sich ausschließlich an Unternehmer.
        </p>

        <div className="xlegal-warning">
          <strong>Entwurf — noch nicht anwaltlich geprüft</strong>
          <p>
            Diese Fassung ist inhaltlich vollständig, aber sie ersetzt keine
            Rechtsberatung. Vor dem Verkaufsstart gehören insbesondere die
            Haftungsregelung, die Beschränkung auf Unternehmer und die
            Beschreibung der Vermittlerrolle auf den Tisch einer Kanzlei mit
            IT-Recht-Schwerpunkt.
          </p>
        </div>

        <section>
          <h2>1. Anbieter, Begriffe und Geltungsbereich</h2>
          <div>
            <p>
              Anbieter ist 300 – Inhaber Roman Dering, Einzelunternehmen,
              Heilig-Kreuz-Straße 18, 87600 Kaufbeuren, Deutschland. Kontakt: {""}
              <a href="mailto:info@x-portal.eu">info@x-portal.eu</a> oder über
              das <Link href="/contact">Kontaktformular</Link>.
            </p>
            <p>
              In diesen Bedingungen bezeichnet <strong>XPORTAL</strong> den
              vorgenannten Anbieter und zugleich die unter x-portal.eu
              erreichbare Website samt Anwendung.{" "}
              <strong>Nutzer</strong> ist, wer XPORTAL verwendet — als Gast,
              mit einem Konto oder mit einem kostenpflichtigen Plan; er ist der
              Vertragspartner dieser Bedingungen.{" "}
              <strong>Freelancer</strong> ist eine selbständig tätige Person,
              deren Profil über XPORTAL auffindbar ist. Ein Freelancer wird
              durch diese Bedingungen nicht Vertragspartner des Nutzers; ein
              Vertrag zwischen beiden kommt allein zwischen ihnen zustande
              (Abschnitt 10).{" "}
              <strong>Dienstleister</strong> ist ein Unternehmen, das für
              XPORTAL einen abgegrenzten technischen Beitrag erbringt; welche
              Arten das sind, steht in den{" "}
              <Link href="/privacy">Datenschutzhinweisen</Link>.
            </p>
            <p>
              Diese Bedingungen gelten für die Nutzung der Website, des
              Gastzugangs, eines Kontos und aller kostenpflichtigen Leistungen.
              Abweichende oder ergänzende Bedingungen des Nutzers werden nicht
              Vertragsbestandteil, auch wenn XPORTAL ihnen nicht ausdrücklich
              widerspricht.
            </p>
          </div>
        </section>

        <section>
          <h2>2. Ausschließlich Unternehmer</h2>
          <div>
            <p>
              XPORTAL richtet sich ausschließlich an Unternehmer im Sinne des
              § 14 BGB, also an natürliche oder juristische Personen und
              rechtsfähige Personengesellschaften, die bei Abschluss des
              Vertrags in Ausübung ihrer gewerblichen oder selbständigen
              beruflichen Tätigkeit handeln. Ein Angebot an Verbraucher im Sinne
              des § 13 BGB erfolgt nicht.
            </p>
            <p>
              Mit der Nutzung bestätigen Sie, dass Sie als Unternehmer handeln.
              Beim Abschluss einer kostenpflichtigen Leistung wird diese
              Eigenschaft ausdrücklich abgefragt; ohne Bestätigung kommt kein
              kostenpflichtiger Vertrag zustande. XPORTAL behält sich vor, einen
              Nachweis zu verlangen und einen Vertrag nicht zu schließen oder zu
              beenden, wenn die Angabe unzutreffend ist.
            </p>
            <p>
              Ein gesetzliches Widerrufsrecht besteht bei Verträgen zwischen
              Unternehmern nicht.
            </p>
          </div>
        </section>

        <section>
          <h2>3. Leistungen</h2>
          <div>
            <p>XPORTAL stellt bereit:</p>
            <ul>
              <li>
                eine dialogbasierte Oberfläche, in der eine Projektbeschreibung
                in einen strukturierten Anforderungsbrief überführt wird;
              </li>
              <li>
                einen regelbasierten Abgleich dieses Briefs mit kuratierten
                Freelancer-Profilen;
              </li>
              <li>
                auf ausdrückliche Anforderung eine Suche nach öffentlich
                zugänglichen beruflichen Profilen im Web;
              </li>
              <li>
                die Möglichkeit, ein Profil auszuwählen und über einen vom
                Freelancer bereitgestellten Link einen Termin anzufragen;
              </li>
              <li>
                Speicherung der eigenen Projekte, Merklisten und Ergebnisse
                sowie Export und Löschung dieser Daten.
              </li>
            </ul>
            <p>
              XPORTAL entwickelt die Anwendung fortlaufend weiter. Funktionen
              können hinzukommen, sich ändern oder entfallen, solange der
              vertraglich geschuldete Kern erhalten bleibt. Wesentliche
              Einschränkungen einer bezahlten Leistung werden mit angemessenem
              Vorlauf angekündigt.
            </p>
          </div>
        </section>

        <section>
          <h2>4. Konto und Gastzugang</h2>
          <div>
            <p>
              Die Anwendung kann zunächst ohne Registrierung mit einer anonymen
              Sitzung genutzt werden. Der Funktionsumfang eines Gastzugangs ist
              eingeschränkt; eine Sitzung ist an das jeweilige Gerät gebunden
              und kann verloren gehen.
            </p>
            <p>
              Für ein dauerhaftes Konto sind zutreffende Angaben erforderlich.
              Zugangsdaten sind vertraulich zu behandeln und dürfen nicht an
              Dritte weitergegeben werden. Ein Verdacht auf unbefugte Nutzung
              ist unverzüglich mitzuteilen. Teilen sich mehrere Personen ein
              Guthaben, verantwortet der Kontoinhaber deren Nutzung.
            </p>
          </div>
        </section>

        <section>
          <h2>5. Credits</h2>
          <div>
            <p>
              Die Nutzung KI-gestützter Funktionen wird in Credits abgerechnet.
              Es gibt zwei Arten, die sich unterschiedlich verhalten:
            </p>
            <ul>
              <li>
                <strong>Monatliches Kontingent.</strong> Es ist dem gewählten
                Plan zugeordnet, füllt sich zu Beginn jeder Abrechnungsperiode
                wieder auf und verfällt am Ende der Periode. Nicht genutzte
                Credits werden nicht übertragen und nicht vergütet.
              </li>
              <li>
                <strong>Einzeln erworbene Credits.</strong> Sie verfallen nicht
                und bleiben bestehen, solange das Konto besteht. Sie werden erst
                verbraucht, wenn das monatliche Kontingent aufgebraucht ist.
              </li>
            </ul>
            <p>
              Die Anwendung zeigt vor einer kostenpflichtigen Aktion an, wie
              viele Credits sie kostet. Der Verbrauch richtet sich nach dem
              tatsächlichen Aufwand der Anfrage; die hinterlegte Berechnung ist
              in der Anwendung einsehbar. Credits sind kein Zahlungsmittel,
              nicht übertragbar und werden nicht in Geld ausgezahlt.
            </p>
            <p>
              Wird ein Konto vom Nutzer gelöscht oder aus wichtigem Grund
              beendet, verfallen verbleibende Credits ohne Erstattung. Endet der
              Vertrag durch ordentliche Kündigung, bleiben einzeln erworbene
              Credits bis zum Ablauf der bezahlten Periode nutzbar.
            </p>
          </div>
        </section>

        <section>
          <h2>6. Vertragsschluss, Preise und Zahlung</h2>
          <div>
            <p>
              Die Darstellung der Pläne in der Anwendung ist kein bindendes
              Angebot, sondern eine Aufforderung zur Abgabe eines Angebots. Der
              Vertrag kommt zustande, wenn XPORTAL die Bestellung bestätigt oder
              die Leistung bereitstellt.
            </p>
            <p>
              Alle Preise verstehen sich als Nettopreise zuzüglich der
              gesetzlichen Umsatzsteuer. Der Preis eines Plans gilt je
              Abrechnungsperiode, der Preis einzeln erworbener Credits je
              Einheit. Maßgeblich ist der zum Zeitpunkt der Bestellung
              angezeigte Preis.
            </p>
            <p>
              Die Vergütung ist mit Bereitstellung fällig. Über abgerechnete
              Leistungen stellt XPORTAL eine Rechnung mit den Pflichtangaben
              nach § 14 UStG. Preisänderungen für laufende Verträge werden
              mindestens sechs Wochen vor Wirksamwerden in Textform mitgeteilt;
              der Nutzer kann den Vertrag bis zum Wirksamwerden zum Ende der
              laufenden Periode kündigen.
            </p>
          </div>
        </section>

        <section>
          <h2>7. Laufzeit und Kündigung</h2>
          <div>
            <p>
              Ein kostenpflichtiger Plan läuft einen Monat und verlängert sich
              um jeweils einen weiteren Monat, wenn er nicht bis zum Ende der
              laufenden Periode gekündigt wird. Die Kündigung ist in Textform
              möglich, etwa über das{" "}
              <Link href="/contact">Kontaktformular</Link> oder per E-Mail.
            </p>
            <p>
              Das Recht zur Kündigung aus wichtigem Grund bleibt für beide
              Seiten unberührt. Ein wichtiger Grund liegt für XPORTAL
              insbesondere vor bei erheblichem Verstoß gegen Abschnitt 8, bei
              unzutreffender Angabe der Unternehmereigenschaft oder bei
              Zahlungsverzug trotz Mahnung.
            </p>
            <p>
              Die kostenlose Nutzung kann jederzeit ohne Frist beendet werden,
              indem das Konto in der Anwendung gelöscht wird.
            </p>
          </div>
        </section>

        <section>
          <h2>8. Pflichten des Nutzers</h2>
          <div>
            <p>Der Nutzer verpflichtet sich, insbesondere:</p>
            <ul>
              <li>
                keine besonderen Kategorien personenbezogener Daten nach Art. 9
                DSGVO und keine vertraulichen Daten Dritter einzugeben, soweit
                dafür keine Rechtsgrundlage besteht;
              </li>
              <li>
                keine rechtswidrigen, rechtsverletzenden oder
                persönlichkeitsverletzenden Inhalte einzustellen;
              </li>
              <li>
                die technischen Grenzen der Anwendung nicht zu umgehen,
                insbesondere keine automatisierten Abrufe außerhalb der
                vorgesehenen Oberfläche vorzunehmen und Profildaten nicht
                systematisch auszulesen oder zu vervielfältigen;
              </li>
              <li>
                Profildaten ausschließlich zur Anbahnung einer konkreten
                geschäftlichen Zusammenarbeit zu verwenden und nicht für
                Werbung, Weiterverkauf oder den Aufbau eigener Datenbestände;
              </li>
              <li>
                die Anwendung nicht zur Erstellung oder Verbreitung
                irreführender Inhalte über die dargestellten Personen zu nutzen.
              </li>
            </ul>
            <p>
              Bei einem Verstoß kann XPORTAL den Zugang vorübergehend
              einschränken. Vor einer dauerhaften Sperrung wird der Nutzer
              angehört, soweit dies nicht wegen Gefahr im Verzug oder wegen
              gesetzlicher Pflichten unmöglich ist.
            </p>
          </div>
        </section>

        <section>
          <h2>9. KI-gestützte Ergebnisse</h2>
          <div>
            <p>
              XPORTAL setzt KI ein, um eine Projektbeschreibung zu
              strukturieren. Die Auswahl und Reihenfolge der Profile folgt
              dokumentierten, überprüfbaren Regeln, nicht einer Bewertung durch
              das Modell. Eine automatisierte Einzelentscheidung mit rechtlicher
              oder ähnlich erheblicher Wirkung im Sinne des Art. 22 DSGVO findet
              nicht statt.
            </p>
            <p>
              KI-gestützte Ergebnisse können unvollständig oder unzutreffend
              sein. Sie sind eine Vorbereitung der Entscheidung, nicht die
              Entscheidung. Der Nutzer prüft Ergebnisse eigenverantwortlich,
              bevor er auf ihrer Grundlage handelt. XPORTAL sagt keine
              bestimmte Trefferzahl, Passgenauigkeit oder Verfügbarkeit eines
              Profils zu.
            </p>
          </div>
        </section>

        <section>
          <h2>10. Rolle bei der Vermittlung</h2>
          <div>
            <p>
              XPORTAL stellt den Kontakt her und stellt Informationen bereit.
              Ein Vertrag über die Leistung eines Freelancers kommt
              ausschließlich zwischen dem Nutzer und dem Freelancer zustande.
              XPORTAL wird nicht Partei dieses Vertrags, schuldet keinen
              Vermittlungserfolg und erbringt keine Arbeitnehmerüberlassung und
              keine Arbeitsvermittlung.
            </p>
            <p>
              XPORTAL prüft weder Qualifikationen, Zeugnisse und Referenzen noch
              die Frage, ob eine Zusammenarbeit sozialversicherungsrechtlich als
              selbständige Tätigkeit einzuordnen ist. Die Beurteilung von
              Scheinselbständigkeit, Werk- und Dienstvertragsgestaltung sowie
              der steuerlichen und sozialversicherungsrechtlichen Folgen
              obliegt dem Nutzer.
            </p>
            <p>
              Profilangaben stammen von den Freelancern selbst oder aus
              öffentlich zugänglichen beruflichen Quellen. Als geprüft
              gekennzeichnete Angaben sind gesondert ausgewiesen; alle übrigen
              sind Angaben Dritter, für die XPORTAL keine Gewähr übernimmt.
            </p>
          </div>
        </section>

        <section>
          <h2>11. Rechte an Inhalten</h2>
          <div>
            <p>
              Rechte an den vom Nutzer eingestellten Inhalten bleiben beim
              Nutzer. Er räumt XPORTAL das einfache, räumlich unbeschränkte und
              auf die Vertragslaufzeit begrenzte Recht ein, diese Inhalte zu
              speichern, zu verarbeiten und anzuzeigen, soweit dies zur
              Erbringung der Leistung erforderlich ist.
            </p>
            <p>
              Inhalte des Nutzers werden nicht zum Training von KI-Modellen
              verwendet und nicht an Dritte zu deren eigenen Zwecken
              weitergegeben. Rechte an der Anwendung selbst, an ihrer Struktur
              und an den kuratierten Profildatenbeständen verbleiben bei XPORTAL
              beziehungsweise den jeweiligen Rechteinhabern.
            </p>
          </div>
        </section>

        <section>
          <h2>12. Verfügbarkeit</h2>
          <div>
            <p>
              XPORTAL bemüht sich um einen durchgehenden Betrieb, schuldet
              jedoch keine bestimmte Verfügbarkeit. Wartungsarbeiten werden
              soweit möglich in nutzungsarme Zeiten gelegt. Ausfälle, die auf
              Störungen bei Vorleistern wie Hosting-, Datenbank- oder
              KI-Anbietern beruhen, liegen außerhalb des Einflussbereichs von
              XPORTAL.
            </p>
            <p>
              Führt eine von XPORTAL zu vertretende Störung dazu, dass eine
              bezahlte Leistung über einen erheblichen Zeitraum nicht nutzbar
              ist, wird das monatliche Entgelt anteilig gutgeschrieben.
            </p>
          </div>
        </section>

        <section>
          <h2>13. Haftung</h2>
          <div>
            <p>
              XPORTAL haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit,
              bei arglistigem Verschweigen eines Mangels, bei Übernahme einer
              Garantie sowie bei Verletzung des Lebens, des Körpers oder der
              Gesundheit und nach dem Produkthaftungsgesetz.
            </p>
            <p>
              Bei einfacher Fahrlässigkeit haftet XPORTAL nur für die Verletzung
              wesentlicher Vertragspflichten — solcher Pflichten, deren
              Erfüllung die ordnungsgemäße Durchführung des Vertrags erst
              ermöglicht und auf deren Einhaltung der Nutzer regelmäßig
              vertrauen darf. In diesem Fall ist die Haftung auf den bei
              Vertragsschluss vorhersehbaren, vertragstypischen Schaden
              begrenzt.
            </p>
            <p>
              Eine weitergehende Haftung ist ausgeschlossen. Für den Verlust von
              Daten haftet XPORTAL nur in Höhe des Aufwands, der bei
              ordnungsgemäßer und regelmäßiger Datensicherung durch den Nutzer
              zur Wiederherstellung erforderlich gewesen wäre. Für das Verhalten
              vermittelter Freelancer und für den Erfolg einer Zusammenarbeit
              haftet XPORTAL nicht.
            </p>
          </div>
        </section>

        <section>
          <h2>14. Datenschutz</h2>
          <div>
            <p>
              Wie XPORTAL personenbezogene Daten verarbeitet, steht in den{" "}
              <Link href="/privacy">Datenschutzhinweisen</Link>. Verarbeitet der
              Nutzer über XPORTAL personenbezogene Daten Dritter, bleibt er
              dafür verantwortlich und stellt sicher, dass eine Rechtsgrundlage
              besteht.
            </p>
          </div>
        </section>

        <section>
          <h2>15. Änderungen dieser Bedingungen</h2>
          <div>
            <p>
              XPORTAL kann diese Bedingungen ändern, wenn dies zur Anpassung an
              geänderte Rechtslage, Rechtsprechung oder an einen geänderten
              Leistungsumfang erforderlich ist. Änderungen werden mindestens
              sechs Wochen vor Wirksamwerden in Textform mitgeteilt.
            </p>
            <p>
              Widerspricht der Nutzer nicht bis zum Wirksamwerden, gelten die
              geänderten Bedingungen als angenommen; auf diese Wirkung wird in
              der Mitteilung gesondert hingewiesen. Im Fall des Widerspruchs
              kann jede Seite den Vertrag zum Wirksamwerden der Änderung
              kündigen.
            </p>
          </div>
        </section>

        <section>
          <h2>16. Schlussbestimmungen</h2>
          <div>
            <p>
              Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss
              des UN-Kaufrechts. Ist der Nutzer Kaufmann, juristische Person des
              öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen,
              ist Kaufbeuren ausschließlicher Gerichtsstand für alle
              Streitigkeiten aus diesem Vertrag.
            </p>
            <p>
              XPORTAL ist nicht bereit und nicht verpflichtet, an
              Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
              teilzunehmen.
            </p>
            <p>
              Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der
              übrigen Bestimmungen unberührt.
            </p>
          </div>
        </section>

        <p className="xlegal-updated">
          Fassung {TERMS_VERSION} · Stand: {TERMS_EFFECTIVE_DATE}
        </p>
      </article>

      <footer className="xlegal-footer">
        <Link href="/chat">Zurück zu XPORTAL</Link>
        <span>
          <Link href="/imprint">Impressum</Link>
          {" · "}
          <Link href="/privacy">Datenschutz</Link>
          {" · "}
          <Link href="/contact">Kontakt</Link>
        </span>
      </footer>
    </main>
  );
}
