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
      intro="Bei XPORTAL hilft KI, eine Projektbeschreibung in strukturierte Anforderungen zu übersetzen. Der anschließende interne Profilabgleich folgt festen Regeln. Dadurch lässt sich nachvollziehen, warum ein Profil vorgeschlagen wird."
      aside={<MatchExample />}
    >
      <ContentSection id="definition" label="Begriff" title="Was ist KI-gestütztes Freelancer-Matching?">
        <p>KI-gestütztes Freelancer-Matching bezeichnet hier die Verbindung von sprachbasierter Anforderungserfassung und einem Abgleich mit Freelancer-Profilen. Sie beschreiben die Aufgabe in eigenen Worten. Das System ordnet die Angaben so, dass sie für eine Suche genutzt werden können.</p>
        <p>Bei XPORTAL sind diese Aufgaben getrennt: Die KI strukturiert den Projekttext. Die interne Auswahl und Reihenfolge der Profile entstehen durch einen regelbasierten Abgleich. Die KI entscheidet nicht, welche Person Sie beauftragen.</p>
      </ContentSection>

      <ContentSection id="filter" title="Warum eine Filterliste nicht jede Anforderung erfasst">
        <p>Filter sind hilfreich, wenn Begriffe und Anforderungen bereits klar sind. In einer Projektbeschreibung stehen aber häufig auch Alternativen, Ausschlüsse und Prioritäten: eine Fähigkeit ist zwingend, eine andere nur wünschenswert; zwei Technologien können alternativ geeignet sein.</p>
        <p>Ein Suchbegriff allein erklärt diese Beziehungen nicht. XPORTAL versucht, die im Text genannten Anforderungen mit ihrer Bedeutung zu erfassen. Damit wird aus „Python oder C++“ eine Alternative, während eine ausdrücklich ausgeschlossene Kompetenz nicht als gewünschter Skill behandelt werden soll.</p>
        <p>Die Erfassung kann Fehler machen. Kontrollieren Sie deshalb die strukturierte Projektübersicht und ergänzen Sie unklare Angaben. Den vollständigen <Link href={MARKETING_PAGE.how.path}>Ablauf von Eingabe bis Auswahl</Link> erklären wir separat.</p>
      </ContentSection>

      <ContentSection id="abgleich" label="Vom Text zum Match" title="Wie XPORTAL Anforderungen abgleicht">
        <ol className={styles.steps}>
          <li><h3>Genannte Anforderungen erfassen</h3><p>Fähigkeiten, Arbeitsmodus, Sprache, Ort, Zeitrahmen und gegebenenfalls Budget werden aus Ihren Angaben strukturiert. Nicht genannte Fakten sollen unbekannt bleiben.</p></li>
          <li><h3>Vorhandene Profilangaben zuordnen</h3><p>Der Abgleich unterscheidet Kernkompetenzen, optionale Fähigkeiten und ausdrücklich zwingende Bedingungen. Welche fehlende oder widersprüchliche Angabe eine Empfehlung ausschließt, richtet sich nach dem jeweiligen Kriterium.</p></li>
          <li><h3>Gründe und offene Punkte ausgeben</h3><p>Die Ergebnisse zeigen passende Angaben und bekannte Lücken. Hinterlegte Hinweise zu Branche, Zertifikaten oder Projekterfahrung können ergänzend einfließen. Sie ersetzen im Matching keine fehlende Kernkompetenz.</p></li>
        </ol>
      </ContentSection>

      <ContentSection id="match-gruende" title="Was eine Match-Begründung enthält">
        <p>Eine Begründung benennt die für die Anfrage relevanten Überschneidungen. Das können im Profil genannte Kompetenzen, die Sprache, der Arbeitsmodus oder andere hinterlegte Rahmenbedingungen sein. Ergänzende Erfahrungsinformationen werden nur berücksichtigt, soweit sie im Profilbestand als entsprechende Hinweise vorliegen.</p>
        <p>Die Begründung entsteht aus dem vorhandenen Datenstand. Sie ist weder ein vollständiges Bild der Person noch eine unabhängige Prüfung sämtlicher Profilangaben. Hinweise aus Selbstauskünften und als bestätigt hinterlegte Fakten haben unterschiedliche Aussagekraft.</p>
        <div className={styles.note}><strong>„Nicht belegt“ heißt: Es fehlt Information.</strong><p>Es bedeutet nicht automatisch, dass jemand eine Fähigkeit nicht besitzt. Je nach Kriterium bleibt eine Lücke sichtbar oder eine ausdrücklich zwingende Bedingung verhindert eine Empfehlung.</p></div>
      </ContentSection>

      <ContentSection id="grenzen" label="Grenzen" title="Die Entscheidung bleibt bei Ihnen">
        <p>XPORTAL kann Anforderungen falsch verstehen und nur Informationen auswerten, die vorliegen. Ein hoher fachlicher Bezug sagt nicht voraus, wie die Zusammenarbeit verlaufen wird. Aktuelle Verfügbarkeit, Honorar, konkrete Erfahrung und vertragliche Fragen müssen Sie im weiteren Austausch klären.</p>
        <p>Wenn kein ausreichend passender interner Match vorliegt, zeigt XPORTAL dies an. Externe Recherche ist ein gesonderter Vorgang. Extern gefundene Profile werden ausdrücklich als nicht durch XPORTAL verifiziert gekennzeichnet.</p>
        <p>Sie möchten den Ablauf an einer eigenen Aufgabe nutzen? Auf <Link href={MARKETING_PAGE.find.path}>Freelancer finden</Link> sehen Sie den Einstieg und Beispiele für Projektfelder.</p>
      </ContentSection>

      <ContentSection id="fragen" title="Häufige Fragen zum Matching">
        <Questions items={[
          { question: "Bewertet die KI die Freelancer?", answer: <p>Im internen Matching strukturiert die KI Ihre Projektangaben. Die Auswahl und Sortierung der Profile werden anschließend nach implementierten Regeln berechnet. Eine automatische Beauftragung findet nicht statt.</p> },
          { question: "Werden fehlende Profilangaben ergänzt?", answer: <p>Fehlende Angaben sollen nicht als Tatsachen angenommen werden. XPORTAL zeigt bekannte Informationslücken an. Ob eine offene Angabe eine Empfehlung verhindert, hängt von der Anforderung und dem Kriterium ab.</p> },
          { question: "Ist eine Match-Begründung eine Qualitätsgarantie?", answer: <p>Nein. Sie erklärt eine Zuordnung anhand vorhandener Daten. Die konkrete Eignung für Ihr Projekt klären Sie im Gespräch und anhand der für Sie erforderlichen Nachweise.</p> },
        ]} />
      </ContentSection>
    </MarketingPage>
  );
}
