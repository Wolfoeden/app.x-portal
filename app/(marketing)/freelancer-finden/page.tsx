import Link from "next/link";
import { Categories } from "@/components/marketing/Categories";
import { ContentSection, MarketingPage, MatchExample, Questions } from "@/components/marketing/MarketingPage";
import { MARKETING_PAGE, pageMetadata } from "@/lib/seo";
import styles from "@/components/marketing/marketing.module.css";

export const metadata = pageMetadata(MARKETING_PAGE.find);

export default function FindFreelancersPage() {
  return (
    <MarketingPage
      page={MARKETING_PAGE.find}
      eyebrow="Freelancer für Ihr Projekt"
      title="Passende Freelancer finden – mit nachvollziehbarer Match-Begründung."
      intro="Beschreiben Sie Ihr Projekt in wenigen Sätzen. XPORTAL strukturiert Ihre Anforderungen und gleicht sie mit vorhandenen Profilinformationen ab. Sie sehen, was für einen Match spricht und welche Fragen offenbleiben."
      aside={<MatchExample />}
    >
      <ContentSection id="ablauf" label="So starten Sie" title="In drei Schritten zur fundierten Auswahl.">
        <ol className={styles.steps}>
          <li><h3>Projekt beschreiben</h3><p>Was soll entstehen? Welche Fähigkeiten sind erforderlich? Fügen Sie Ihre Projektbeschreibung in den Chat ein. Angaben zu Arbeitsmodus, Start und Budget helfen, sofern sie schon feststehen.</p></li>
          <li><h3>Anforderungen und Matches ansehen</h3><p>XPORTAL ordnet Ihre Angaben und sucht im vorhandenen Profilbestand. Die Ergebnisse zeigen fachliche Überschneidungen, passende Rahmenbedingungen und fehlende Informationen. Ergänzen oder korrigieren Sie Ihre Anforderungen im Dialog.</p></li>
          <li><h3>Profil auswählen und Fragen klären</h3><p>Sie entscheiden, welches Profil Sie näher ansehen und mit wem Sie Kontakt aufnehmen möchten. Für das dauerhafte Speichern und die Fortsetzung mit einem Profil ist ein Konto vorgesehen. Eine Beauftragung erfolgt nicht automatisch.</p></li>
        </ol>
      </ContentSection>

      <ContentSection id="begruendung" label="Entscheidungshilfe" title="Ein Profil allein erklärt noch keinen Match.">
        <p>Eine lange Ergebnisliste lässt oft offen, warum eine Person zur konkreten Aufgabe passt. XPORTAL verknüpft Ihre Anforderungen mit den vorhandenen Angaben im Profil. Ein genannter Skill, ein passender Arbeitsmodus oder eine dokumentierte Erfahrung können so im Projektkontext eingeordnet werden.</p>
        <p>Die Begründung hilft Ihnen auch beim nächsten Gespräch: Welche Kompetenz ist im Profil genannt? Worauf beruht die Einschätzung? Welche Qualifikation, welcher Starttermin oder welcher Honorarsatz muss noch geklärt werden?</p>
        <p>Wie diese Zuordnung entsteht, erläutert die Seite zum <Link href={MARKETING_PAGE.matching.path}>KI-gestützten Freelancer-Matching</Link>.</p>
      </ContentSection>

      <ContentSection id="projektfelder" label="Projekt und Fähigkeiten" title="Mit der Aufgabe beginnen. Dann die Skills präzisieren.">
        <Categories />
        <p>Für technische Vorhaben finden Sie auf <Link href={MARKETING_PAGE.it.path}>IT-Freelancer finden</Link> Hinweise zur Beschreibung von Stack, Aufgaben und Rahmenbedingungen.</p>
      </ContentSection>

      <ContentSection id="transparenz" label="Transparenz" title="Sichtbar machen, was bekannt ist.">
        <p>Die Aussagekraft eines Matches hängt von Ihrer Beschreibung und den vorhandenen Profilinformationen ab. Nicht jede Angabe ist unabhängig bestätigt. Eine im Profil genannte Fähigkeit ist deshalb kein pauschales Qualitätssiegel für die Person.</p>
        <div className={styles.note}><strong>Offene Informationen bleiben offen.</strong><p>Wenn zum Beispiel ein Honorar oder eine Qualifikation fehlt, ist das eine Rückfrage für Ihre Auswahl. XPORTAL ergänzt daraus keine Zusage. Auch ein passender Eintrag im Profil ersetzt keine aktuelle Abstimmung der Verfügbarkeit.</p></div>
        <p>Ergibt der Abgleich keine ausreichend passende Empfehlung, wird das ausgewiesen. Eine mögliche externe Recherche ist ein gesonderter Schritt mit Anmeldung und bewusster Bestätigung. Den <Link href={MARKETING_PAGE.how.path + "#kosten"}>Credit-Verbrauch</Link> können Sie vorab nachlesen.</p>
      </ContentSection>

      <ContentSection id="fragen" title="Häufige Fragen zur Freelancer-Suche">
        <Questions items={[
          { question: "Wie genau muss meine Projektbeschreibung sein?", answer: <p>Beginnen Sie mit der Aufgabe und den wirklich erforderlichen Fähigkeiten. Unterscheiden Sie Muss-Anforderungen von Wünschen. Arbeitsmodus, Ort, Start und Budget können Sie ergänzen, sobald sie feststehen. Fehlende Angaben bleiben als unbekannt erkennbar.</p> },
          { question: "Kann ich ohne Anmeldung starten?", answer: <p>Ja. Der Chat unterstützt den Einstieg als Gast. Für dauerhaft gespeicherte Projekte und weitere Schritte mit ausgewählten Profilen können Sie anschließend ein Konto erstellen. Die verfügbaren Kontingente stehen in der <Link href={MARKETING_PAGE.how.path + "#kosten"}>Kostenübersicht</Link>.</p> },
          { question: "Bekomme ich garantiert einen passenden Freelancer?", answer: <p>Nein. Empfehlungen hängen von den Anforderungen und den vorhandenen Profilen ab. Auch teilweise passende Profile können offene Punkte haben. Eine Empfehlung ist keine Zusage zu Verfügbarkeit, Zusammenarbeit oder Projekterfolg.</p> },
          { question: "Wird ein Freelancer durch meine Suche schon beauftragt?", answer: <p>Nein. Sie sehen zunächst Ergebnisse und wählen selbst. Kontakt, Gespräch und Beauftragung sind anschließende Entscheidungen. Eine Suche schließt keinen Vertrag mit einem Freelancer.</p> },
        ]} />
      </ContentSection>
    </MarketingPage>
  );
}
