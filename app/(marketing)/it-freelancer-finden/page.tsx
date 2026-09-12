import Link from "next/link";
import { Categories } from "@/components/marketing/Categories";
import { ContentSection, MarketingPage, Questions } from "@/components/marketing/MarketingPage";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";
import styles from "@/components/marketing/marketing.module.css";

export const metadata = pageMetadata(MARKETING_PAGE.it);

export default function ItFreelancersPage() {
  return (
    <MarketingPage
      page={MARKETING_PAGE.it}
      eyebrow="Für technische Projekte"
      title="IT-Freelancer finden, die zu Ihrer Aufgabe passen."
      intro="Eine Technologie allein beschreibt noch kein Projekt. Nennen Sie die Aufgabe, die benötigte Erfahrung und Ihre Rahmenbedingungen. XPORTAL gleicht diese Angaben mit vorhandenen Freelancer-Profilen ab und zeigt die Gründe für vorgeschlagene Matches."
    >
      <ContentSection id="anforderungen" label="Eine gute Suchanfrage" title="Aufgabe, Stack und Verantwortung zusammen beschreiben">
        <p>Für eine aussagekräftige Suche hilft es, die Rolle im Projekt konkret zu machen: Soll jemand eine bestehende Anwendung erweitern, eine SAP-Schnittstelle anbinden oder fachliche Anforderungen für die Umsetzung aufbereiten?</p>
        <p>Nennen Sie anschließend die erforderlichen Fähigkeiten und unterscheiden Sie sie von Wünschen. Zwei alternativ geeignete Technologien können Sie als Alternative angeben. Bereits feststehende Anforderungen an Sprache, Arbeitsmodus, Ort und Start gehören ebenfalls in die Beschreibung.</p>
        <div className={styles.note}>
          <strong>Beispiel einer Projektbeschreibung</strong>
          <p>„Wir erweitern eine bestehende Anwendung mit React und TypeScript. Gesucht ist Unterstützung bei der Entwicklung und der Abstimmung von Schnittstellen. Remote, Deutsch für die Zusammenarbeit. Python ist optional; Start und Budget klären wir noch.“</p>
        </div>
        <p>Das ist eine Eingabehilfe, kein vorhandenes Projektangebot. Im Chat können Sie Ihren eigenen Text einfügen und die erkannten Anforderungen anschließend kontrollieren.</p>
      </ContentSection>

      <ContentSection id="kompetenzen" label="Beispiele aus dem Produktvokabular" title="Welche IT-Kompetenzen können Sie beschreiben?">
        <Categories />
      </ContentSection>

      <ContentSection id="begruendete-auswahl" title="Fachliche Passung nachvollziehen">
        <p>XPORTAL stellt Ihre Anforderungen den vorhandenen Profilangaben gegenüber. Die Match-Begründung benennt relevante Überschneidungen. Im Projektkontext erfasste Hinweise zu Erfahrung, Branche oder Zertifikaten können ergänzen, warum ein Profil näher betrachtet werden sollte.</p>
        <p>Eine Projekterwähnung wird dabei nicht automatisch zum Nachweis einer geforderten Technologie. Ebenso wenig belegt ein genannter Skill schon die Tiefe der Erfahrung, die Ihr Projekt benötigt. Klären Sie Verantwortungsumfang und vergleichbare Aufgaben im Gespräch.</p>
        <p>Die <Link href={MARKETING_PAGE.matching.path}>Erklärung zum KI-Freelancer-Matching</Link> zeigt, wie Anforderungen, ergänzende Informationen und Lücken voneinander getrennt werden.</p>
      </ContentSection>

      <ContentSection id="klaerungsbedarf" label="Vor der Zusammenarbeit" title="Die offenen Punkte gehören zur Auswahl">
        <ul>
          <li><strong>Konkrete Erfahrung:</strong> Welche vergleichbaren Aufgaben hat die Person übernommen und welchen Anteil selbst umgesetzt?</li>
          <li><strong>Verfügbarkeit:</strong> Passt der tatsächliche Start und der benötigte Umfang zu Ihrem Projekt?</li>
          <li><strong>Honorar und Budget:</strong> Welche Konditionen gelten? Fehlende Preisangaben im Profil sind keine Budgetzusage.</li>
          <li><strong>Zusammenarbeit:</strong> Welche Abstimmungen, Zugänge und Übergaben braucht die Aufgabe?</li>
        </ul>
        <p>Diese Fragen sind Hinweise für Ihr Gespräch. XPORTAL sagt damit keine bereits erfolgte Prüfung zu. Auch bei fachlich passenden Profilen treffen Sie die Auswahl selbst.</p>
      </ContentSection>

      <ContentSection id="kein-treffer" title="Wenn die Kombination zu keinem passenden Profil führt">
        <p>Der Profilbestand kann Ihre Anforderungen nur abdecken, soweit entsprechende Informationen vorliegen. XPORTAL weist aus, wenn kein ausreichend passender interner Match entsteht. Prüfen Sie dann zunächst, ob die erfassten Anforderungen Ihrer Absicht entsprechen.</p>
        <p>Ein tatsächlich notwendiger Skill sollte nicht nur für mehr Treffer gestrichen werden. Sie können Anforderungen präzisieren oder gegebenenfalls eine gesonderte externe Recherche starten. Dafür sind ein Konto und Ihre Bestätigung erforderlich. Die <Link href={MARKETING_PAGE.how.path + "#kosten"}>Kosten und Credits</Link> werden getrennt von Freelancer-Honoraren erläutert.</p>
      </ContentSection>

      <ContentSection id="fragen" title="Häufige Fragen zu IT-Freelancern">
        <Questions items={[
          { question: "Gibt es für jede genannte Technologie Freelancer?", answer: <p>Das lässt sich aus einer Skill-Kategorie nicht ableiten. Das hinterlegte Vokabular unterstützt die Erfassung von Anforderungen. Ob passende Profile vorhanden sind, ergibt erst der konkrete Abgleich. Aktuelle Verfügbarkeit muss zusätzlich geklärt werden.</p> },
          { question: "Kann ich Muss-Skills und optionale Erfahrung unterscheiden?", answer: <p>Ja. Formulieren Sie ausdrücklich, was zwingend notwendig und was optional ist. Prüfen Sie die strukturierte Übersicht nach der Eingabe. Auch Alternativen und Ausschlüsse sollten klar benannt werden.</p> },
          { question: "Kann ich eine vorhandene Projektbeschreibung verwenden?", answer: <p>Ja. Fügen Sie den relevanten Text in den Chat ein. Konzentrieren Sie sich auf Aufgaben, benötigte Fähigkeiten und Rahmenbedingungen. Unnötige persönliche oder vertrauliche Informationen gehören nicht in eine Suchanfrage.</p> },
        ]} />
        <p>Für den allgemeinen Ablauf lesen Sie auch <Link href={MARKETING_PAGE.find.path}>Freelancer finden für Ihr Projekt</Link>.</p>
      </ContentSection>
    </MarketingPage>
  );
}
