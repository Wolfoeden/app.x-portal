import Image from "next/image";
import Link from "next/link";

import { DEMO_FACES } from "@/lib/marketing/live-demo";
import { AUTOMATION_OFFER } from "@/lib/marketing/offers";

import { Tag } from "./MiniVisuals";
import { ArrowIcon, CheckIcon, ShieldIcon, SparkIcon } from "./icons";
import styles from "./home.module.css";

function AgentVisual() {
  return (
    <div className={styles.tileVisual}>
      <div className={styles.flow}>
        <span>Mail</span>
        <ArrowIcon />
        <span className={styles.flowHub}><SparkIcon size={20} /></span>
        <ArrowIcon />
        <span>ERP</span>
      </div>
      <div className={styles.visualRow}><span>Antwort-Entwurf</span><Tag done>fertig</Tag></div>
      <div className={styles.visualRow}><span>Bestand geprüft</span><Tag done>14 Stk.</Tag></div>
    </div>
  );
}

function SchoolVisual() {
  return (
    <div className={styles.tileVisual}>
      <div className={styles.certificate}>
        <div className={styles.certificateHead}>
          <span aria-hidden="true"><CheckIcon size={20} /></span>
          <div><p>Teilnahme bestätigt</p><p><strong>KI-Kompetenz nach Art. 4 EU AI Act</strong></p></div>
        </div>
        <p className={styles.certificateMeta}><span>20 Personen</span><span>½ Tag</span></p>
        <span className={styles.certificateBar} aria-hidden="true" />
      </div>
    </div>
  );
}

const ISO_STEPS = [
  { label: "Bestandsaufnahme", state: "done" },
  { label: "Risiken bewerten", state: "done" },
  { label: "Maßnahmen umsetzen", state: "now" },
  { label: "Zertifizierungsaudit", state: "next" },
] as const;

function SecurityVisual() {
  return (
    <div className={styles.tileVisual}>
      <div className={styles.isoHead}>
        <span aria-hidden="true"><ShieldIcon /></span>
        <div><p><strong>ISO 27001</strong></p><span className={styles.progress} aria-hidden="true"><span /></span></div>
      </div>
      <ol className={styles.isoSteps}>
        {ISO_STEPS.map((step) => (
          <li key={step.label} data-state={step.state}>
            <span aria-hidden="true">{step.state === "done" ? <CheckIcon size={11} /> : null}</span>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function TalentVisual({ profiles }: { profiles: number | null }) {
  return (
    <div className={styles.tileVisual}>
      <div className={styles.faces}>
        {DEMO_FACES.map((src) => <Image key={src} src={src} alt="" width={42} height={42} unoptimized />)}
        {profiles && profiles > DEMO_FACES.length ? <span>+{profiles - DEMO_FACES.length}</span> : null}
      </div>
      <p className={styles.facesLabel}>{profiles ? `${profiles} geprüfte Profile` : "Geprüfte Profile"}</p>
      <div className={styles.searchMock}><span>KI-Entwickler, remote, ab Januar</span><span>Suchen</span></div>
    </div>
  );
}

/**
 * „Was wir für Sie umsetzen“: vier Kacheln, jede mit einem Bild dessen, was
 * am Ende dasteht — ein Agent zwischen Postfach und ERP, eine
 * Teilnahmebestätigung, der Weg zum ISO-27001-Audit, die geprüften Profile.
 */
export function ServiceTiles({ profiles }: { profiles: number | null }) {
  const tiles = [
    { visual: <AgentVisual />, title: AUTOMATION_OFFER.name, text: "KI-Agenten übernehmen Routine: Anfragen, Angebote, Auswertungen.", price: `${AUTOMATION_OFFER.price} · ${AUTOMATION_OFFER.terms}`, href: "#termin", link: "Im Erstgespräch klären" },
    { visual: <SchoolVisual />, title: "KI-Schulungen", text: "Seit Februar 2025 Pflicht (EU AI Act, Art. 4). Halbtags, vor Ort oder online.", href: "#termin", link: "Im Erstgespräch klären" },
    { visual: <SecurityVisual />, title: "Informationssicherheit", text: "ISO 27001 einführen, begleitet bis zum Audit.", href: "#termin", link: "Im Erstgespräch klären" },
    { visual: <TalentVisual profiles={profiles} />, title: "Talent Index", text: "Geprüfte IT- und KI-Experten, wenn Ihnen Leute fehlen.", href: "/fuer-unternehmen", link: "Selbst ausprobieren" },
  ];
  return (
    <ul className={styles.tiles}>
      {tiles.map((tile) => (
        <li key={tile.title}>
          <Link href={tile.href} className={styles.tile} prefetch={false}>
            {tile.visual}
            <span className={styles.tileText}>
              <strong>{tile.title}</strong>
              <span>{tile.text}</span>
              {"price" in tile ? <span className={styles.tilePrice}>{tile.price}</span> : null}
              <span className={styles.tileLink}>{tile.link} <ArrowIcon /></span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
