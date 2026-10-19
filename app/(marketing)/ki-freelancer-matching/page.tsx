import Link from "next/link";
import { ContentSection, MarketingPage, MatchExample, Questions } from "@/components/marketing/MarketingPage";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";
import styles from "@/components/marketing/marketing.module.css";

export const metadata = pageMetadata(MARKETING_PAGE.matching);

export default function AiMatchingPage() {
  return (
    <MarketingPage
      page={MARKETING_PAGE.matching}
      eyebrow="Die Matching-Mechanik"
      title="KI-gestütztes Freelancer-Matching verstehen."
      intro="Bei XPORTAL arbeitet KI an zwei Stellen: Sie übersetzt eine Projektbeschreibung in strukturierte Anforderungen, und sie bewertet die vorausgewählten Profile gegen Ihre Anfrage. Jeder Vorschlag kommt mit Begründung und offenen Punkten, damit nachvollziehbar bleibt, warum ein Profil oben steht."
      aside={<MatchExample />}
    >
      <ContentSection id="definition" label="Begriff" title="Was ist KI-gestütztes Freelancer-Matching?">
        <p>KI-gestütztes Freelancer-Matching bezeichnet hier die Verbindung von sprachbasierter Anforderungserfassung und einem Abgleich mit Freelancer-Profilen. Sie beschreiben die Aufgabe in eigenen Worten. Das System ordnet die Angaben so, dass sie für eine Suche genutzt werden können.</p>
        <p>Bei XPORTAL läuft die Suche in zwei Stufen. Zuerst wählt XPORTAL aus allen aktiven Profilen die 20 aus, die Ihrer Anfrage inhaltlich am nächsten sind. Danach bewertet die KI diese Profile gegen Ihre Anfrage und stellt die drei besten mit Begründung nach oben; alle 20 bleiben einsehbar. Wen Sie ansprechen und beauftragen, entscheiden Sie.</p>
      </ContentSection>

      <ContentSection id="filter" title="Warum eine Filterliste nicht jede Anforderung erfasst">
        <p>Filter sind hilfreich, wenn Begriffe und Anforderungen bereits klar sind. In einer Projektbeschreibung stehen aber häufig auch Alternativen, Ausschlüsse und Prioritäten: eine Fähigkeit ist zwingend, eine andere nur wünschenswert; zwei Technologien können alternativ geeignet sein.</p>
        <p>Ein Suchbegriff allein erklärt diese Beziehungen nicht. XPORTAL versucht, die im Text genannten Anforderungen mit ihrer Bedeutung zu erfassen. Damit wird aus „Python oder C++“ eine Alternative, während eine ausdrücklich ausgeschlossene Kompetenz nicht als gewünschter Skill behandelt werden soll.</p>
        <p>Die Erfassung kann Fehler machen. Kontrollieren Sie deshalb die strukturierte Projektübersicht und ergänzen Sie unklare Angaben. Den vollständigen <Link href={MARKETING_PAGE.how.path}>Ablauf von Eingabe bis Auswahl</Link> erklären wir separat.</p>
      </ContentSection>

      <ContentSection id="abgleich" label="Vom Text zum Match" title="Wie XPORTAL Anforderungen abgleicht">
        <ol className={styles.steps}>
          <li><h3>Genannte Anforderungen erfassen</h3><p>Fähigkeiten, Arbeitsmodus, Sprache, Ort, Zeitrahmen und gegebenenfalls Budget werden aus Ihren Angaben strukturiert. Nicht genannte Fakten sollen unbekannt bleiben.</p></li>
          <li><h3>Inhaltlich passende Profile vorauswählen</h3><p>Aus allen aktiven Profilen werden die 20 ausgewählt, die der Anfrage inhaltlich am nächsten sind. Gleichbedeutende Begriffe in anderer Sprache, Abkürzung oder Schreibweise zählen mit, etwa ISMS und Informationssicherheitsmanagement.</p></li>
          <li><h3>Bewerten, begründen, offene Punkte nennen</h3><p>Die KI bewertet die Vorauswahl gegen Ihre Anfrage und nennt zu den drei besten, welche Anforderungen sie mit welchen Profilangaben belegen und was offen ist. Branche, Zertifikate und Projekterfahrung fließen ein, soweit sie im Profil stehen.</p></li>
        </ol>
      </ContentSection>

      <ContentSection id="match-gruende" title="Was eine Match-Begründung enthält">
        <p>Eine Begründung benennt die für die Anfrage relevanten Überschneidungen. Das können im Profil genannte Kompetenzen, die Sprache, der Arbeitsmodus oder andere hinterlegte Rahmenbedingungen sein. Ergänzende Erfahrungsinformationen werden nur berücksichtigt, soweit sie im Profilbestand als entsprechende Hinweise vorliegen.</p>
        <p>Die Begründung entsteht aus dem vorhandenen Datenstand. Sie ist weder ein vollständiges Bild der Person noch eine unabhängige Prüfung sämtlicher Profilangaben. Hinweise aus Selbstauskünften und als bestätigt hinterlegte Fakten haben unterschiedliche Aussagekraft.</p>
        <div className={styles.note}><strong>„Nicht belegt“ heißt: Es fehlt Information.</strong><p>Es bedeutet nicht automatisch, dass jemand eine Fähigkeit nicht besitzt. Eine fehlende Angabe steht deshalb als offener Punkt beim Vorschlag, den Sie im Gespräch klären.</p></div>
      </ContentSection>

      <ContentSection id="grenzen" label="Grenzen" title="Die Entscheidung bleibt bei Ihnen">
        <p>XPORTAL kann Anforderungen falsch verstehen und nur Informationen auswerten, die vorliegen. Ein hoher fachlicher Bezug sagt nicht voraus, wie die Zusammenarbeit verlaufen wird. Aktuelle Verfügbarkeit, Honorar, konkrete Erfahrung und vertragliche Fragen müssen Sie im weiteren Austausch klären.</p>
        <p>Wenn kein ausreichend passender interner Match vorliegt, zeigt XPORTAL dies an. Externe Recherche ist ein gesonderter Vorgang. Extern gefundene Profile werden ausdrücklich als nicht durch XPORTAL verifiziert gekennzeichnet.</p>
        <p>Sie möchten den Ablauf an einer eigenen Aufgabe nutzen? Auf <Link href={MARKETING_PAGE.find.path}>Freelancer finden</Link> sehen Sie den Einstieg und Beispiele für Projektfelder.</p>
      </ContentSection>

      <ContentSection id="fragen" title="Häufige Fragen zum Matching">
        <Questions items={[
          { question: "Bewertet die KI die Freelancer?", answer: <p>Ja. Die KI strukturiert Ihre Projektangaben, XPORTAL wählt die 20 inhaltlich nächsten Profile vor, und die KI bewertet sie gegen Ihre Anfrage, mit Begründung und offenen Punkten. Die Auswahl treffen Sie; eine automatische Beauftragung findet nicht statt.</p> },
          { question: "Werden fehlende Profilangaben ergänzt?", answer: <p>Fehlende Angaben sollen nicht als Tatsachen angenommen werden. XPORTAL zeigt bekannte Informationslücken an. Ob eine offene Angabe eine Empfehlung verhindert, hängt von der Anforderung und dem Kriterium ab.</p> },
          { question: "Ist eine Match-Begründung eine Qualitätsgarantie?", answer: <p>Nein. Sie erklärt eine Zuordnung anhand vorhandener Daten. Die konkrete Eignung für Ihr Projekt klären Sie im Gespräch und anhand der für Sie erforderlichen Nachweise.</p> },
        ]} />
      </ContentSection>
    </MarketingPage>
  );
}
