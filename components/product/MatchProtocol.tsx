import styles from "./match-protocol.module.css";

type ProtocolVariant = "recruiting" | "freelancer";

type ProtocolStep = {
  code: string;
  owner: string;
  title: string;
  detail: string;
};

const PROTOCOLS: Record<ProtocolVariant, readonly ProtocolStep[]> = {
  recruiting: [
    {
      code: "EINGABE",
      owner: "Sie",
      title: "Aufgabe beschreiben",
      detail: "Projektziel, Muss-Kriterien und Rahmenbedingungen.",
    },
    {
      code: "STRUKTUR",
      owner: "KI",
      title: "Angaben ordnen",
      detail: "Die KI übernimmt Angaben aus Ihrem Text und markiert Unsicherheit.",
    },
    {
      code: "ABGLEICH",
      owner: "Regeln",
      title: "Profile vergleichen",
      detail: "Feste Kriterien prüfen Belege, Ausschlüsse und offene Angaben.",
    },
    {
      code: "ENTSCHEIDUNG",
      owner: "Sie",
      title: "Belege und Lücken prüfen",
      detail: "Kontakt oder Recherche starten erst nach Ihrer Entscheidung.",
    },
  ],
  freelancer: [
    {
      code: "PROFIL",
      owner: "Sie",
      title: "Angaben belegen",
      detail: "Rolle, Skills, Verfügbarkeit, Honorar und Nachweise.",
    },
    {
      code: "SICHTUNG",
      owner: "XPORTAL",
      title: "Profil prüfen",
      detail: "Wir sichten Ihre Angaben, bevor das Profil sichtbar wird.",
    },
    {
      code: "MATCH",
      owner: "Regeln",
      title: "Bezug herstellen",
      detail: "Nur passende Profilangaben werden als Beleg zu einer Anfrage gezeigt.",
    },
    {
      code: "KONTAKT",
      owner: "Kunde",
      title: "Selbst entscheiden",
      detail: "Ein Kontakt entsteht erst durch eine bewusste Auswahl.",
    },
  ],
};

export function MatchProtocol({
  variant = "recruiting",
  compact = false,
  activeStep = 4,
  structureMode = "ki",
  label = "So entsteht ein nachvollziehbarer Match",
}: {
  variant?: ProtocolVariant;
  compact?: boolean;
  activeStep?: number;
  structureMode?: "ki" | "basis";
  label?: string;
}) {
  const steps = variant === "recruiting" && structureMode === "basis"
    ? PROTOCOLS.recruiting.map((step, index) => index === 1
      ? {
          ...step,
          owner: "Basis",
          title: "Angaben regelbasiert ordnen",
          detail: "Die sichere Basisanalyse übernimmt erkennbare Angaben ohne KI-Antwort.",
        }
      : step)
    : PROTOCOLS[variant];

  return (
    <section
      className={`${styles.protocol}${compact ? ` ${styles.compact}` : ""}`}
      aria-label={label}
    >
      <header className={styles.heading}>
        <span>Match-Protokoll</span>
        <strong>{label}</strong>
      </header>
      <ol className={styles.track}>
        {steps.map((step, index) => {
          const state = index + 1 < activeStep
            ? "complete"
            : index + 1 === activeStep
              ? "active"
              : "pending";
          return (
            <li key={step.code} data-state={state}>
              <span className={styles.marker} aria-hidden="true">
                {(index + 1).toString().padStart(2, "0")}
              </span>
              <div>
                <p><span>{step.code}</span><b>{step.owner}</b></p>
                <h3>{step.title}</h3>
                <small>{step.detail}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
