import { AnswerVisual, InboxVisual, OfferVisual } from "./MiniVisuals";
import { BookIcon, DocumentIcon, MailIcon, SparkIcon, TeamCheckIcon } from "./icons";
import styles from "./home.module.css";

const INPUTS = [
  { icon: <MailIcon />, title: "E-Mail-Postfach", note: "Anfragen, Reklamationen" },
  { icon: <DocumentIcon />, title: "Anfrage mit Zeichnung", note: "PDF, Bild, Stückliste" },
  { icon: <BookIcon />, title: "Handbücher und Dokumente", note: "Service, Wartung, Normen" },
] as const;

const OUTPUTS = [
  {
    title: "Anfragen sortiert",
    note: "Beim Richtigen, Standardfragen schon beantwortet.",
    visual: <InboxVisual rows={[{ text: "Reklamation 4711", tag: "Service" }, { text: "500 Frästeile", tag: "Vertrieb" }, { text: "Wann liefern Sie?", tag: "beantwortet", done: true }]} />,
  },
  {
    title: "Angebot vorbereitet",
    note: "Daten übernommen. Ihr Team prüft nur noch.",
    visual: <OfferVisual fields={[["Kunde", "Müller GmbH"], ["Teil", "Flansch DN 80"], ["Menge", "500 Stück"]]} footnote="Aus Anfrage und Zeichnung" />,
  },
  {
    title: "Antwort mit Quelle",
    note: "Aus Ihren eigenen Unterlagen.",
    visual: <AnswerVisual question="Anzugsmoment M12 an der Spindel?" answer="85 Nm." source="Wartungshandbuch, S. 42" />,
  },
] as const;

/** Drei Linien von links in die Mitte (oder von der Mitte nach rechts). */
function Connector({ side }: { side: "in" | "out" }) {
  const paths = [100, 300, 500].map((y) => (side === "in" ? `M0 ${y} C 55 ${y}, 45 300, 100 300` : `M0 300 C 55 300, 45 ${y}, 100 ${y}`));
  return (
    <svg className={styles.connector} data-side={side} viewBox="0 0 100 600" preserveAspectRatio="none" aria-hidden="true">
      {paths.map((d) => <path key={d} d={d} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/**
 * „Dieselbe Technik für Ihre Abläufe“: was hereinkommt (Postfach,
 * Zeichnungen, Handbücher), der KI-Agent in der Mitte, was herauskommt —
 * und darunter, dass am Ende ein Mensch freigibt. Auf schmalen Bildschirmen
 * untereinander, ohne Linien.
 */
export function AgentDiagram() {
  return (
    <figure className={styles.diagram} aria-label="So arbeitet ein KI-Agent in Ihren Abläufen">
      <div className={styles.diagramGrid}>
        <p className={styles.diagramHeadIn}>Was hereinkommt</p>
        <p className={styles.diagramHeadOut}>Was herauskommt</p>
        {INPUTS.map((input, index) => (
          <div key={input.title} className={styles.diagramIn} style={{ gridRow: index + 2 }}>
            <div className={styles.inputCard}>
              <span className={styles.inputIcon}>{input.icon}</span>
              <span><strong>{input.title}</strong><span>{input.note}</span></span>
            </div>
          </div>
        ))}
        <Connector side="in" />
        <div className={styles.hub}>
          <div>
            <SparkIcon size={30} />
            <strong>KI-Agent</strong>
            <span>liest · versteht<br />bereitet vor</span>
          </div>
        </div>
        <Connector side="out" />
        {OUTPUTS.map((output, index) => (
          <div key={output.title} className={styles.diagramOut} style={{ gridRow: index + 2 }}>
            <div className={styles.outputCard}>
              <div className={styles.outputText}>
                <span className={styles.number}>{index + 1}</span>
                <strong>{output.title}</strong>
                <span>{output.note}</span>
              </div>
              <div className={styles.outputVisual}>{output.visual}</div>
            </div>
          </div>
        ))}
      </div>
      <figcaption className={styles.teamBar}>
        <span aria-hidden="true"><TeamCheckIcon /></span>
        <p><strong>Am Ende entscheidet Ihr Team.</strong> <span>Jeder Entwurf wird geprüft und freigegeben, bevor er rausgeht.</span></p>
      </figcaption>
    </figure>
  );
}
