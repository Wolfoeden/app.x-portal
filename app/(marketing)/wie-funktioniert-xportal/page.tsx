import Link from "next/link";
import { CreditSummary } from "@/components/marketing/CreditSummary";
import { ContentSection, MarketingPage, Questions } from "@/components/marketing/MarketingPage";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";
import styles from "@/components/marketing/marketing.module.css";

export const metadata = pageMetadata(MARKETING_PAGE.how);

export default function HowXportalWorksPage() {
  return (
    <MarketingPage
      page={MARKETING_PAGE.how}
      eyebrow="Die Produkterklärung"
      title="Wie funktioniert XPORTAL?"
      intro="XPORTAL unterstützt Unternehmen dabei, Freelancer anhand einer konkreten Projektbeschreibung zu finden. Hier erfahren Sie, wie aus Ihrem Text strukturierte Anforderungen, begründete Vorschläge und offene Fragen für Ihre Auswahl werden."
    >
      <nav className={styles.contents} aria-label="Auf dieser Seite">
        <p>Vom Projekttext zur Auswahl</p>
        <ol>
          <li><a href="#eingabe">Eingabe</a></li>
          <li><a href="#anforderungen">Anforderungen</a></li>
          <li><a href="#matching">Matching</a></li>
          <li><a href="#begruendung">Begründung</a></li>
          <li><a href="#informationsluecken">Informationslücken</a></li>
          <li><a href="#auswahl">Ihre Auswahl</a></li>
          <li><a href="#kosten">Kosten & Credits</a></li>
          <li><a href="#fragen">Häufige Fragen</a></li>
        </ol>
      </nav>

      <ContentSection id="eingabe" label="Schritt 1" title="Sie beschreiben Ihr Projekt">
        <p>Der Einstieg erfolgt im Chat. Sie können eine Aufgabe in wenigen Sätzen beschreiben oder eine vorhandene Projektbeschreibung einfügen. Benennen Sie das gewünschte Ergebnis und die dafür erforderlichen Fähigkeiten.</p>
        <p>Wenn sie bereits feststehen, ergänzen Sie Sprache, Arbeitsmodus, Ort, Startfenster, Dauer und Budget. Kennzeichnen Sie Muss-Anforderungen, Wünsche und Alternativen möglichst deutlich. Die ersten Projektanalysen sind kostenlos; Sie brauchen dafür nur ein Konto, keine Karte.</p>
        <p>Nachrichten im weiteren Dialog können die Anforderungen ergänzen oder korrigieren. Die strukturierte Übersicht dient dazu, die erfassten Angaben zu kontrollieren.</p>
      </ContentSection>

      <ContentSection id="anforderungen" label="Schritt 2" title="KI strukturiert Ihre Angaben">
        <p>Bei der Anforderungserfassung, auch „Requirement Extraction“ genannt, wird der Projekttext in einzelne Felder übersetzt. Dazu gehören erforderliche und optionale Skills, ausgeschlossene Fähigkeiten sowie die genannten Rahmenbedingungen.</p>
        <p>Die KI soll nur Angaben aus Ihrem Text übernehmen. Die Anwendung validiert das Ergebnis und gleicht übernommene Fakten mit dem Ausgangstext ab. Eine nicht genannte Qualifikation, ein Budget oder ein Starttermin soll unbekannt bleiben.</p>
        <p>Das verhindert nicht jeden Interpretationsfehler. Lesen Sie die erfassten Anforderungen deshalb durch. Wenn die KI-Verarbeitung nicht verfügbar ist, kann XPORTAL eine begrenztere regelbasierte Erfassung verwenden; auch dann ist Ihre Kontrolle sinnvoll.</p>
      </ContentSection>

      <ContentSection id="matching" label="Schritt 3" title="Vorauswahl und KI-Bewertung">
        <p>Aus allen aktiven Freelancer-Profilen wählt XPORTAL zuerst die 20 aus, die Ihrer Anfrage inhaltlich am nächsten sind. Die Vorauswahl vergleicht Bedeutung, nicht nur Wörter: Gleichbedeutende Begriffe in anderer Sprache oder Schreibweise zählen mit.</p>
        <p>Diese 20 Profile bewertet die KI gegen Ihre Anfrage. Die drei besten stehen oben, jeweils mit Begründung, welche Anforderungen das Profil belegt, und mit den Punkten, die offen sind. Alle 20 Profile der Vorauswahl können Sie aufklappen und selbst durchsehen.</p>
        <p>Die Bewertung stützt sich nur auf die Angaben im Profil. Was dort nicht steht, nennt sie als offenen Punkt, statt es anzunehmen. Ist die KI-Bewertung einmal nicht erreichbar, stehen die inhaltlich nächsten Profile oben und sind als nicht bewertet gekennzeichnet.</p>
        <p>Weitere Erläuterungen finden Sie unter <Link href={MARKETING_PAGE.matching.path}>KI-gestütztes Freelancer-Matching</Link>.</p>
      </ContentSection>

      <ContentSection id="begruendung" label="Ergebnis" title="Die Gründe stehen beim Vorschlag">
        <p>Für vorgeschlagene Profile werden die ausschlaggebenden Überschneidungen dargestellt. Sie können beispielsweise sehen, welche geforderten Skills im Profil genannt sind oder welcher Arbeitsmodus zur Anfrage passt.</p>
        <p>Eine Match-Begründung beschreibt die Beziehung zwischen Ihrer Anfrage und dem vorliegenden Profil. Sie ist kein pauschales Urteil über die Person. Angaben können auf Selbstauskünften oder auf als bestätigt hinterlegten Fakten beruhen; das ist nicht gleichbedeutend mit einer unabhängigen Prüfung des gesamten Profils.</p>
      </ContentSection>

      <ContentSection id="informationsluecken" title="Fehlende Angaben bleiben als Lücken sichtbar">
        <p>Die Ergebnisdarstellung führt bekannte Informationslücken auf. Fehlt beispielsweise ein Nachweis zu einer gewünschten Qualifikation, ist die Eigenschaft damit noch nicht geklärt. Ein nicht genannter Honorarsatz darf nicht als passendes Budget interpretiert werden.</p>
        <div className={styles.note}><strong>Unbekannt und unpassend sind unterschiedliche Aussagen.</strong><p>Je nach Anforderung kann eine offene Angabe sichtbar bleiben oder eine zwingende Bedingung eine Empfehlung ausschließen. Eine Lücke wird nicht durch eine erfundene Angabe geschlossen.</p></div>
        <p>Wenn die Anfrage noch nicht klar genug ist oder kein ausreichend passendes internes Profil vorliegt, wird dies ausgewiesen. Teilweise passende Profile sind keine vollständige Erfüllung sämtlicher Anforderungen.</p>
      </ContentSection>

      <ContentSection id="auswahl" title="Sie wählen aus und entscheiden über die nächsten Schritte">
        <p>Sie können Profile ansehen, Fragen prüfen und entscheiden, ob Sie ein Profil speichern oder einen Kontakt anfragen möchten. Für dauerhafte Speicherung und weitere Schritte mit einem Profil ist ein Konto vorgesehen. Die Suche allein beauftragt niemanden.</p>
        <p>Aktuelle Verfügbarkeit, Honorar, konkrete Erfahrung und die Bedingungen einer Zusammenarbeit klären Sie im weiteren Austausch. XPORTAL trifft keine automatische Einstellungs- oder Beauftragungsentscheidung.</p>
        <p>Die externe AI-Agent-Recherche ist vom internen Abgleich getrennt. Wenn sie angeboten wird, braucht sie ein Konto und Ihre ausdrückliche Bestätigung. Externe Ergebnisse werden als nicht durch XPORTAL verifiziert gekennzeichnet; auch sie sind keine garantierten Empfehlungen.</p>
      </ContentSection>

      <ContentSection id="kosten" label="Kosten verständlich machen" title="Credits stehen für einzelne Leistungen">
        <CreditSummary />
      </ContentSection>

      <ContentSection id="fragen" title="Häufige Fragen zu XPORTAL">
        <Questions items={[
          { question: "Was macht die KI und was macht der Matcher?", answer: <p>Die KI unterstützt die Strukturierung Ihres Textes. Der interne Matcher gleicht die erfassten Anforderungen nach festen Regeln mit vorhandenen Profilangaben ab. Auswahl und Beauftragung bleiben Ihre Entscheidung.</p> },
          { question: "Kann ich ein erkanntes Detail korrigieren?", answer: <p>Ja. Sie können die Projektangaben im Dialog ergänzen oder korrigieren. Prüfen Sie danach die aktualisierte Übersicht, insbesondere bei Muss-Anforderungen, Alternativen oder Ausschlüssen.</p> },
          { question: "Sind sämtliche Freelancer unabhängig geprüft?", answer: <p>Eine solche pauschale Zusage macht XPORTAL hier nicht. Einzelne Fakten können als bestätigt hinterlegt sein, andere beruhen auf Profilangaben oder Selbstauskünften. Prüfen Sie die für Ihr Projekt entscheidenden Nachweise im weiteren Austausch.</p> },
          { question: "Startet nach der Anmeldung automatisch eine Recherche?", answer: <p>Nein. Eine externe Recherche wird separat bestätigt. Die Anmeldung allein startet weder eine AI-Agent-Recherche noch eine Beauftragung.</p> },
          { question: "Enthalten die Plattformpreise das Honorar des Freelancers?", answer: <p>Nein. Die angegebenen Credits und Preise betreffen XPORTAL-Leistungen. Das Honorar und die Bedingungen der Zusammenarbeit mit einem Freelancer müssen gesondert vereinbart werden.</p> },
        ]} />
        <p>Zum Einstieg: <Link href={MARKETING_PAGE.find.path}>Freelancer finden</Link> oder <Link href={MARKETING_PAGE.it.path}>IT-Projekte konkret beschreiben</Link>.</p>
      </ContentSection>
    </MarketingPage>
  );
}
